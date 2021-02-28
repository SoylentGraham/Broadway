    //   return Module;
    //})();
    
    var resultModule;
    if (typeof global !== "undefined"){
      if (global.Module){
        resultModule = global.Module;
      };
    };
    if (typeof Module != "undefined"){
      resultModule = Module;
    };

    resultModule._broadwayOnHeadersDecoded = par_broadwayOnHeadersDecoded;
    resultModule._broadwayOnPictureDecoded = par_broadwayOnPictureDecoded;
    
    var moduleIsReady = false;
    var cbFun;
    var moduleReady = function(){
      moduleIsReady = true;
      if (cbFun){
        cbFun(resultModule);
      }
    };
    
    resultModule.onRuntimeInitialized = function(){
      moduleReady(resultModule);
    };
    return function(callback){
      if (moduleIsReady){
        callback(resultModule);
      }else{
        cbFun = callback;
      };
    };
  };

  return (function(){
    "use strict";
  
  
  var nowValue = function(){
    return (new Date()).getTime();
  };
  
  if (typeof performance != "undefined"){
    if (performance.now){
      nowValue = function(){
        return performance.now();
      };
    };
  };
  
  
  //	gr: it seems like onDecoderReady is being called before thread drops out,
  //		so it's not assigned before its called
  var Decoder = function(parOptions,onDecoderReady)
  {
  	function onDecoderReadyDefault()
  	{
  		console.log(`onDecoderReadyDefault in module`);
  	}
    this.options = parOptions || {};
    
    this.onDecoderReady = onDecoderReady ||onDecoderReadyDefault;
    
    this.now = nowValue;
    
    var asmInstance;
    
    var fakeWindow = {
    };
    
    var toU8Array;
    var toU32Array;
    
    var onPicFun = function ($buffer, width, height, framenumber) {
      var buffer = this.pictureBuffers[$buffer];
      if (!buffer) {
        buffer = this.pictureBuffers[$buffer] = toU8Array($buffer, (width * height * 3) / 2);
      };
      
      let Meta = this.FrameMetas[framenumber] || {};
      Meta.finishDecoding = nowValue();
      Meta._InputDecodeFrameNumber = framenumber;	//	for debugging, store this
      
      if (this.options.rgb){
        if (!asmInstance){
          asmInstance = getAsm(width, height);
        };
        asmInstance.inp.set(buffer);
        asmInstance.doit();

        var copyU8 = new Uint8Array(asmInstance.outSize);
        copyU8.set( asmInstance.out );
        
        this.onPictureDecoded(copyU8, width, height, Meta);
        return;
        
      };
      
      this.onPictureDecoded(buffer, width, height, Meta);
    }.bind(this);
    
    var ignore = false;
    
    if (this.options.sliceMode){
      onPicFun = function ($buffer, width, height, framenumber, $sliceInfo) {
        if (ignore){
          return;
        };
        var buffer = this.pictureBuffers[$buffer];
        if (!buffer) {
          buffer = this.pictureBuffers[$buffer] = toU8Array($buffer, (width * height * 3) / 2);
        };
        var sliceInfo = this.pictureBuffers[$sliceInfo];
        if (!sliceInfo) {
          sliceInfo = this.pictureBuffers[$sliceInfo] = toU32Array($sliceInfo, 18);
        };

		let Meta = this.FrameMetas[framenumber] || {};

        /*if (this.options.rgb){
        
        no rgb in slice mode

        };*/

        Meta.finishDecoding = nowValue();
        var sliceInfoAr = [];
        for (var i = 0; i < 20; ++i){
          sliceInfoAr.push(sliceInfo[i]);
        };
        Meta.sliceInfoAr = sliceInfoAr;

        this.onPictureDecoded(buffer, width, height, Meta);
      }.bind(this);
    };
    
    var ModuleCallback = getModule.apply(fakeWindow, [function () {
    }, onPicFun]);
    

    var MAX_STREAM_BUFFER_LENGTH = 1024 * 1024;
    
    var instance = this;
    this.onPictureDecoded = function (buffer, width, height, Meta) 
    {
		//	not overloaded
    	console.log(`onPictureDecoded. (not overloaded in decoder)`);
    };
        
    var bufferedCalls = [];
    this.decode = function decode(typedAr, parInfo, copyDoneFun) {
      bufferedCalls.push([typedAr, parInfo, copyDoneFun]);
    };
    
    ModuleCallback(function(Module){
      var HEAP8 = Module.HEAP8;
      var HEAPU8 = Module.HEAPU8;
      var HEAP16 = Module.HEAP16;
      var HEAP32 = Module.HEAP32;
      // from old constructor
      Module._broadwayInit();
      
      /**
     * Creates a typed array from a HEAP8 pointer. 
     */
      toU8Array = function(ptr, length) {
        return HEAPU8.subarray(ptr, ptr + length);
      };
      toU32Array = function(ptr, length) {
        //var tmp = HEAPU8.subarray(ptr, ptr + (length * 4));
        return new Uint32Array(HEAPU8.buffer, ptr, length);
      };
      instance.streamBuffer = toU8Array(Module._broadwayCreateStream(MAX_STREAM_BUFFER_LENGTH), MAX_STREAM_BUFFER_LENGTH);
      instance.pictureBuffers = {};
      // collect extra infos that are provided with the nal units
      //	nalu meta should now be in FrameMeta, but this is more like "chunk meta"
      //	nalu splitting perhaps should be outside the decoder
      instance.FrameNumber = 0;	//	for debug purposes, it would be good to start this at an arbritry number like 9999
      instance.FrameMetas = {};	//	[FrameNumber] = input meta

      /**
     * Decodes a stream buffer. This may be one single (unframed) NAL unit without the
     * start code, or a sequence of NAL units with framing start code prefixes. This
     * function overwrites stream buffer allocated by the codec with the supplied buffer.
     */

		//	slice mode splits nalu's for us
      var sliceNum = 0;
      if (instance.options.sliceMode){
        sliceNum = instance.options.sliceNum;

        instance.decode = function decode(typedAr, parInfo, copyDoneFun) {
        	//	now instance.FrameMetas[]
          instance.infoAr.push(parInfo);
          parInfo.startDecoding = nowValue();
          var nals = parInfo.nals;
          var i;
          if (!nals){
            nals = [];
            parInfo.nals = nals;
            var l = typedAr.length;
            var foundSomething = false;
            var lastFound = 0;
            var lastStart = 0;
            for (i = 0; i < l; ++i){
              if (typedAr[i] === 1){
                if (
                  typedAr[i - 1] === 0 &&
                  typedAr[i - 2] === 0
                ){
                  var startPos = i - 2;
                  if (typedAr[i - 3] === 0){
                    startPos = i - 3;
                  };
                  // its a nal;
                  if (foundSomething){
                    nals.push({
                      offset: lastFound,
                      end: startPos,
                      type: typedAr[lastStart] & 31
                    });
                  };
                  lastFound = startPos;
                  lastStart = startPos + 3;
                  if (typedAr[i - 3] === 0){
                    lastStart = startPos + 4;
                  };
                  foundSomething = true;
                };
              };
            };
            if (foundSomething){
              nals.push({
                offset: lastFound,
                end: i,
                type: typedAr[lastStart] & 31
              });
            };
          };

          var currentSlice = 0;
          var playAr;
          var offset = 0;
          for (i = 0; i < nals.length; ++i){
            if (nals[i].type === 1 || nals[i].type === 5){
              if (currentSlice === sliceNum){
                playAr = typedAr.subarray(nals[i].offset, nals[i].end);
                instance.streamBuffer[offset] = 0;
                offset += 1;
                instance.streamBuffer.set(playAr, offset);
                offset += playAr.length;
              };
              currentSlice += 1;
            }else{
              playAr = typedAr.subarray(nals[i].offset, nals[i].end);
              instance.streamBuffer[offset] = 0;
              offset += 1;
              instance.streamBuffer.set(playAr, offset);
              offset += playAr.length;
              let FrameNumber = instance.FrameNumber++;
              let Result = Module._broadwayPlayStream(offset,FrameNumber);
              offset = 0;
            };
          };
          copyDoneFun();
          let FrameNumber = instance.FrameNumber++;
          let Result = Module._broadwayPlayStream(offset,FrameNumber);
        };

      }else{
        instance.decode = function decode(typedAr, Meta)
        {
			Meta = Meta || {};
			let FrameNumber = instance.FrameNumber++;
			Meta.startDecoding = nowValue();
			//console.info(`Decoding frame ${FrameNumber} x${typedAr.length} bytes`);

			//	store meta for later retrieval
			instance.FrameMetas[FrameNumber] = Meta;

			instance.streamBuffer.set(typedAr);
			let Result = Module._broadwayPlayStream(typedAr.length,FrameNumber);
			if ( !Result )
				console.info(`Broadway decoder error`);
        };
      };
      
      if (bufferedCalls.length){
        var bi = 0;
        for (bi = 0; bi < bufferedCalls.length; ++bi){
          instance.decode(bufferedCalls[bi][0], bufferedCalls[bi][1], bufferedCalls[bi][2]);
        };
        bufferedCalls = [];
      };
      
      instance.onDecoderReady(instance);

    });
  

  };

  
  Decoder.prototype = {
    
  };
  

  
  /*
    potential worker initialization
  
  */
  
  
  if (typeof self != "undefined"){
    var isWorker = false;
    var decoder;
    var reuseMemory = false;
    var sliceMode = false;
    var sliceNum = 0;
    var sliceCnt = 0;
    var lastSliceNum = 0;
    var sliceInfoAr;
    var lastBuf;
    var awaiting = 0;
    var pile = [];
    var startDecoding;
    var finishDecoding;
    var timeDecoding;
    
    var memAr = [];
    var getMem = function(length){
      if (memAr.length){
        var u = memAr.shift();
        while (u && u.byteLength !== length){
          u = memAr.shift();
        };
        if (u){
          return u;
        };
      };
      return new ArrayBuffer(length);
    }; 
    
    var copySlice = function(source, target, infoAr, width, height){
      
      var length = width * height;
      var length4 = length / 4
      var plane2 = length;
      var plane3 = length + length4;
      
      var copy16 = function(parBegin, parEnd){
        var i = 0;
        for (i = 0; i < 16; ++i){
          var begin = parBegin + (width * i);
          var end = parEnd + (width * i)
          target.set(source.subarray(begin, end), begin);
        };
      };
      var copy8 = function(parBegin, parEnd){
        var i = 0;
        for (i = 0; i < 8; ++i){
          var begin = parBegin + ((width / 2) * i);
          var end = parEnd + ((width / 2) * i)
          target.set(source.subarray(begin, end), begin);
        };
      };
      var copyChunk = function(begin, end){
        target.set(source.subarray(begin, end), begin);
      };
      
      var begin = infoAr[0];
      var end = infoAr[1];
      if (end > 0){
        copy16(begin, end);
        copy8(infoAr[2], infoAr[3]);
        copy8(infoAr[4], infoAr[5]);
      };
      begin = infoAr[6];
      end = infoAr[7];
      if (end > 0){
        copy16(begin, end);
        copy8(infoAr[8], infoAr[9]);
        copy8(infoAr[10], infoAr[11]);
      };
      
      begin = infoAr[12];
      end = infoAr[15];
      if (end > 0){
        copyChunk(begin, end);
        copyChunk(infoAr[13], infoAr[16]);
        copyChunk(infoAr[14], infoAr[17]);
      };
      
    };
    
    var sliceMsgFun = function(){};
    
    var setSliceCnt = function(parSliceCnt){
      sliceCnt = parSliceCnt;
      lastSliceNum = sliceCnt - 1;
    };
    
    
    self.addEventListener('message', function(e) {
      
      if (isWorker){
        if (reuseMemory){
          if (e.data.reuse){
            memAr.push(e.data.reuse);
          };
        };
        if (e.data.buf){
          if (sliceMode && awaiting !== 0){
            pile.push(e.data);
          }else{
            decoder.decode(
              new Uint8Array(e.data.buf, e.data.offset || 0, e.data.length), 
              e.data.info, 
              function(){
                if (sliceMode && sliceNum !== lastSliceNum){
                  postMessage(e.data, [e.data.buf]);
                };
              }
            );
          };
          return;
        };
        
        if (e.data.slice){
          // update ref pic
          var copyStart = nowValue();
          copySlice(new Uint8Array(e.data.slice), lastBuf, e.data.infos[0].sliceInfoAr, e.data.width, e.data.height);
          // is it the one? then we need to update it
          if (e.data.theOne){
            copySlice(lastBuf, new Uint8Array(e.data.slice), sliceInfoAr, e.data.width, e.data.height);
            if (timeDecoding > e.data.infos[0].timeDecoding){
              e.data.infos[0].timeDecoding = timeDecoding;
            };
            e.data.infos[0].timeCopy += (nowValue() - copyStart);
          };
          // move on
          postMessage(e.data, [e.data.slice]);
          
          // next frame in the pipe?
          awaiting -= 1;
          if (awaiting === 0 && pile.length){
            var data = pile.shift();
            decoder.decode(
              new Uint8Array(data.buf, data.offset || 0, data.length), 
              data.info, 
              function(){
                if (sliceMode && sliceNum !== lastSliceNum){
                  postMessage(data, [data.buf]);
                };
              }
            );
          };
          return;
        };
        
        if (e.data.setSliceCnt){
          setSliceCnt(e.data.sliceCnt);
          return;
        };
        
      }else{
        if (e.data && e.data.type === "Broadway.js - Worker init"){
          isWorker = true;
          
          function OnWorkerDecoderReady()
          {
          	console.log(`OnWorkerDecoderReady()`);
          	postMessage({
                onDecoderReady: true
              });
          }
          
          decoder = new Decoder( e.data.options, OnWorkerDecoderReady );
          
          if (e.data.options.sliceMode){
            reuseMemory = true;
            sliceMode = true;
            sliceNum = e.data.options.sliceNum;
            setSliceCnt(e.data.options.sliceCnt);

            decoder.onPictureDecoded = function (buffer, width, height, Meta) {
              
              // buffer needs to be copied because we give up ownership
              var copyU8 = new Uint8Array(getMem(buffer.length));
              copySlice(buffer, copyU8, Meta.sliceInfoAr, width, height);
              
              startDecoding = Meta.startDecoding;
              finishDecoding = Meta.finishDecoding;
              timeDecoding = finishDecoding - startDecoding;
              Meta.timeDecoding = timeDecoding;
              Meta.timeCopy = 0;
              
              postMessage({
                slice: copyU8.buffer,
                sliceNum: sliceNum,
                width: width, 
                height: height, 
                infos: Meta
              }, [copyU8.buffer]); // 2nd parameter is used to indicate transfer of ownership
              
              awaiting = sliceCnt - 1;
              
              lastBuf = buffer;
              sliceInfoAr = Meta.sliceInfoAr;

            };
            
          }else if (e.data.options.reuseMemory){
            reuseMemory = true;
            decoder.onPictureDecoded = function (buffer, width, height, Meta) {
              
              // buffer needs to be copied because we give up ownership
              var copyU8 = new Uint8Array(getMem(buffer.length));
              copyU8.set( buffer, 0, buffer.length );

              postMessage({
                buf: copyU8.buffer, 
                length: buffer.length,
                width: width, 
                height: height, 
                infos: Meta
              }, [copyU8.buffer]); // 2nd parameter is used to indicate transfer of ownership

            };
            
          }else{
            decoder.onPictureDecoded = function (buffer, width, height, Meta) {
              if (buffer) {
                buffer = new Uint8Array(buffer);
              };

              // buffer needs to be copied because we give up ownership
              var copyU8 = new Uint8Array(buffer.length);
              copyU8.set( buffer, 0, buffer.length );

              postMessage({
                buf: copyU8.buffer, 
                length: buffer.length,
                width: width, 
                height: height, 
                infos: Meta
              }, [copyU8.buffer]); // 2nd parameter is used to indicate transfer of ownership

            };
          };
          postMessage({ consoleLog: "broadway worker initialized" });
        };
      };


    }, false);
  };
  
  Decoder.nowValue = nowValue;
  
  return Decoder;
  
  })();
  
  
}));

