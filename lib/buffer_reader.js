(function () {
    module.exports = newArrayBufferReader;

    function newArrayBufferReader(arrayBuffer) {
        return new BufferReader(arrayBuffer);
    }

    function readUInt32BE(buffer, offset) {
        if (buffer.byteLength < offset + 4) {
            throw new RangeError("Not enough bytes in buffer.");
        }
        return ((buffer[offset + 1] << 16) | readUInt16BE(buffer, offset + 2)) + (buffer[offset] << 24 >>> 0);
    }

    function readUInt16BE(buffer, offset) {
        if (buffer.byteLength < offset + 2) {
            throw new RangeError("Not enough bytes in buffer.");
        }
        return (buffer[offset] << 8) | readUInt8(buffer, offset + 1);
    }

    function readUInt8(buffer, offset) {
        if (buffer.byteLength < offset + 1) {
            throw new RangeError("Not enough bytes in buffer.");
        }
        return buffer[offset];
    }

    function BufferReader(dataBuffer) {
        var self = {};
        self.position = 0;

        self.next = function (bits) {
            var data;
            bits = bits || 8;
            switch (bits) {
                case 8:
                    data = readUInt8(dataBuffer, self.position);
                    break;
                case 16:
                    data = readUInt16BE(dataBuffer, self.position);
                    break;
                case 32:
                    data = readUInt32BE(dataBuffer, self.position);
                    break;
                default:
                    throw new Error("Unsupported read operation.");
            }
            self.position += (bits / 8);
            return data;
        };

        self.nextUInt8 = function () {
            return self.next(8);
        };

        self.nextUInt16BE = function () {
            return self.next(16);
        };

        self.nextUInt32BE = function () {
            return self.next(32);
        };

        self.hasMore = function (bits) {
            bits = bits || 8;
            return dataBuffer.byteLength > self.position + (bits / 8);
        };

        self.rewind = function (bits) {
            bits = bits || 8;
            self.position -= (bits / 8);
        };

        return self;
    }
}());
