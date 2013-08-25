(function() {

    exports.bufferToArrayBuffer = bufferToArrayBuffer;
    exports.isFlagSet = isFlagSet;

    function bufferToArrayBuffer(buffer) {
        var arrayBuffer = new ArrayBuffer(buffer.length),
            view = new Uint8Array(arrayBuffer);

        for (var i = 0; i < buffer.length; ++i) {
            view[i] = buffer[i];
        }
        return arrayBuffer;
    }

    function isFlagSet(mask, flag) {
        return (mask & flag) === flag;
    }

}());
