	//   return Module;
	//})();

	var resultModule;
	if (typeof global !== "undefined")
	{
		if (global.Module)
		{
			resultModule = global.Module;
		};
	};
	if (typeof Module != "undefined")
	{
		resultModule = Module;
	};

	//	bind the C extern functions
	resultModule._broadwayOnHeadersDecoded = par_broadwayOnHeadersDecoded;
	resultModule._broadwayOnPictureDecoded = par_broadwayOnPictureDecoded;

	var moduleIsReady = false;
	var cbFun;
	var moduleReady = function()
	{
		moduleIsReady = true;
		if (cbFun)
		{
			cbFun(resultModule);
		}
	};
	
	function OnModuleRuntimeInitialied()
	{
		moduleReady(resultModule);
	}
	resultModule.onRuntimeInitialized = OnModuleRuntimeInitialied;

	function OnModuleLoaded(callback)
	{
		if (moduleIsReady)
		{
			callback(resultModule);
		}
		else
		{
			cbFun = callback;
		};
	};
	return OnModuleLoaded;
};

	return (function(){
	"use strict";


	//	make a get-ms function
	var GetNowValue = function()
	{
		return (new Date()).getTime();
	};
	if (typeof performance != "undefined")
	{
		if (performance.now)
		{
			GetNowValue = function()
			{
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
    
    this.GetNowValue = GetNowValue;
    
  
    var fakeWindow = {
    };
    
    var toU8Array;
    var toU32Array;
    
	var onPicFun = function ($buffer, width, height, framenumber)
	{
		var buffer = this.pictureBuffers[$buffer];
		if (!buffer) 
		{
			buffer = this.pictureBuffers[$buffer] = toU8Array($buffer, (width * height * 3) / 2);
		};

		let Meta = this.FrameMetas[framenumber] || {};
		Meta.finishDecoding = GetNowValue();
		Meta._InputDecodeFrameNumber = framenumber;	//	for debugging, store this

		this.onPictureDecoded(buffer, width, height, Meta);
	}.bind(this);
    
    var ignore = false;
    
    
    
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
		instance.decode = function decode(typedAr, Meta)
		{
			Meta = Meta || {};
			let FrameNumber = instance.FrameNumber++;
			Meta.startDecoding = GetNowValue();
			//console.info(`Decoding frame ${FrameNumber} x${typedAr.length} bytes`);

			//	store meta for later retrieval
			instance.FrameMetas[FrameNumber] = Meta;

			instance.streamBuffer.set(typedAr);
			let Result = Module._broadwayPlayStream(typedAr.length,FrameNumber);
			if ( !Result )
				console.info(`Broadway decoder error`);
		};

		if (bufferedCalls.length)
		{
			var bi = 0;
			for (bi = 0; bi < bufferedCalls.length; ++bi)
			{
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
    
	function OnWorkerMessage(e)
	{
      if (isWorker){
        if (reuseMemory){
          if (e.data.reuse){
            memAr.push(e.data.reuse);
          };
        };
        if (e.data.buf){
          {
            decoder.decode(
              new Uint8Array(e.data.buf, e.data.offset || 0, e.data.length), 
              e.data.info, 
              function(){}
            );
          };
          return;
        };
        
       
        
      }
      else
      {
        if (e.data && e.data.type === "Broadway.js - Worker init")
        {
          isWorker = true;
          
          function OnWorkerDecoderReady()
          {
          	console.log(`OnWorkerDecoderReady()`);
          	postMessage({
                onDecoderReady: true
              });
          }
          
          decoder = new Decoder( e.data.options, OnWorkerDecoderReady );
          if (e.data.options.reuseMemory)
          {
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
            
          }
          else
          {
            decoder.onPictureDecoded = function (buffer, width, height, Meta) 
            {
              if (buffer) 
              {
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


    };
      
	self.addEventListener('message', OnWorkerMessage, false);
  };
  
  Decoder.GetNowValue = GetNowValue;
  
  return Decoder;
  
  })();
  
  
}));

