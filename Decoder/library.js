var LibraryBroadway = {
  broadwayOnHeadersDecoded: function () {
    par_broadwayOnHeadersDecoded();
  },
  broadwayOnPictureDecoded: function ($buffer, width, height, framenumber) {
    par_broadwayOnPictureDecoded($buffer, width, height, framenumber);
  },
  extern_emit_image: function($buffer, width, height, framenumber, $otherBuffer){
    par_broadwayOnPictureDecoded($buffer, width, height, framenumber, $otherBuffer);
  }
};

mergeInto(LibraryManager.library, LibraryBroadway);
