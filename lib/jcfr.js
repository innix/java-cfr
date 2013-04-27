(function() {
    var CONSTANT_Class_info = 7,
        CONSTANT_Fieldref = 9,
        CONSTANT_Methodref = 10,
        CONSTANT_InterfaceMethodref = 11,
        CONSTANT_String = 8,
        CONSTANT_Integer = 3,
        CONSTANT_Float = 4,
        CONSTANT_Long = 5,
        CONSTANT_Double = 6,
        CONSTANT_NameAndType = 12,
        CONSTANT_Utf8 = 1,
        CONSTANT_MethodHandle = 15,
        CONSTANT_MethodType = 16,
        CONSTANT_InvokeDynamic = 18;

    var ACC_PUBLIC     = 0x0001,
        ACC_FINAL      = 0x0010,
        ACC_SUPER      = 0x0020,
        ACC_INTERFACE  = 0x0200,
        ACC_ABSTRACT   = 0x0400,
        ACC_SYNTHETIC  = 0x1000,
        ACC_ANNOTATION = 0x2000,
        ACC_ENUM       = 0x4000;

    module.exports.readFile = function(filePath) {
        var fs = require("fs"),
            dataBuffer = fs.readFileSync(filePath),
            nativeBuffer = bufferToArrayBuffer(dataBuffer);

        return this.readBuffer(nativeBuffer);
    };

    module.exports.readBuffer = function(dataBuffer) {
        if(!(dataBuffer instanceof ArrayBuffer)) {
            throw new TypeError("Not a native JS buffer.");
        }

        var classFile;
        try {
            classFile = readClassFile(dataBuffer);
            return JSON.stringify(classFile, null, 4);
        } catch(e) {
            if(e instanceof RangeError) {
                throw new FormatError("Unexpected end of class file.");
            }
            throw e;
        }
    };

    function readClassFile(dataBuffer) {
        var bufferReader = require("./abreader"),
            reader = bufferReader.newArrayBufferReader(dataBuffer),
            cf = {};

        // The magic item supplies the magic number identifying the class file format; it has the value 0xCAFEBABE. (§4.1.)
        cf.magic_number = reader.nextUInt32BE();
        if(cf.magic_number !== 0xCAFEBABE) {
            throw new FormatError("Invalid magic_number.");
        }

        cf.minor_version = reader.nextUInt16BE();
        cf.major_version = reader.nextUInt16BE();

        cf.constant_pool_count = reader.nextUInt16BE();
        cf.constant_pool = readConstantPool(reader, cf.constant_pool_count);

        cf.access_flags = reader.nextUInt16BE();
        // TODO: format check access flags.

        // The value of the this_class item must be a valid index into the constant_pool table.
        // The constant_pool entry at that index must be a CONSTANT_Class_info structure (§4.1.)
        cf.this_class = reader.nextUInt16BE();
        if(cf.this_class >= (cf.constant_pool_count - 1) || cf.constant_pool[cf.this_class - 1].tag !== CONSTANT_Class_info) {
            throw new FormatError("Invalid this_class index.");
        }

        cf.super_class = reader.nextUInt16BE();
        if(cf.super_class !== 0) {
            // If invalid const pool index.
            if(cf.super_class >= (cf.constant_pool_count - 1) || cf.constant_pool[cf.super_class - 1].tag !== CONSTANT_Class_info) {
                throw new FormatError("Invalid super_class index.");
            }

            // For an interface, [...] The constant_pool entry at that index must be [...] representing the class Object. (§4.1.)
            if((cf.access_flags & ACC_INTERFACE) === ACC_INTERFACE) {
                var super_class_cp = cf.constant_pool[cf.super_class - 1],
                    super_class_name_cp = cf.constant_pool[super_class_cp.name_index - 1];
                if("java/lang/Object" !== getConstPoolUtf8(super_class_name_cp.bytes)) {
                    throw new FormatError("Invalid super_class index: interfaces can only have 'java/lang/Object' as a superclass.");
                }
            }
        } else {
            // If the value of the super_class item is zero, then this class file must represent the class Object,
            // the only class or interface without a direct superclass. (§4.1.)

            var this_class_cp = cf.constant_pool[cf.super_class - 1],
                this_class_name_cp = cf.constant_pool[this_class_cp.name_index - 1];

            if((cf.access_flags & ACC_INTERFACE) === ACC_INTERFACE) {
                throw new FormatError("Invalid super_class index: interfaces must have 'java/lang/Object' as a superclass.");
            }
            if("java/lang/Object" !== getConstPoolUtf8(this_class_name_cp.bytes)) {
                throw new FormatError("Invalid super_class index: only class 'java/lang/Object' has no superclass.");
            }
        }

        cf.interfaces_count = reader.nextUInt16BE();
        cf.interfaces = readInterfaces(cf, reader, cf.interfaces_count);

        cf.fields_count = reader.nextUInt16BE();
        cf.fields = readFields(reader, cf.fields_count);

        return cf;
    }

    function readConstantPool(reader, constPoolCount) {
        var constPool = [];

        // The constant_pool table is indexed from 1 to constant_pool_count-1 (§4.1.)
        for(var idx = 1; idx <= (constPoolCount - 1); idx++) {
            var cp_info = { index: idx, tag: reader.nextUInt8() };

            if(cp_info.tag == CONSTANT_Utf8) {
                cp_info.length = reader.nextUInt16BE();
                cp_info.bytes = [];
                for(var j = 0; j < cp_info.length; j++) {
                    var b = reader.nextUInt8();

                    // No byte may have the value (byte)0 or lie in the range (byte)0xf0 - (byte)0xff. (§4.4.7.)
                    if(b === 0 || (b >= 0xf0 && b <= 0xff)) {
                        throw new FormatError("Illegal byte value.");
                    }
                    cp_info.bytes.push(b);
                }
            } else if(cp_info.tag == CONSTANT_Integer || cp_info.tag == CONSTANT_Float) {
                cp_info.bytes = reader.nextUInt32BE();
            } else if(cp_info.tag == CONSTANT_Long || cp_info.tag == CONSTANT_Double) {
                cp_info.high_bytes = reader.nextUInt32BE();
                cp_info.low_bytes = reader.nextUInt32BE();
            } else if(cp_info.tag == CONSTANT_Class_info) {
                cp_info.name_index = reader.nextUInt16BE();
            } else if(cp_info.tag == CONSTANT_String) {
                cp_info.string_index = reader.nextUInt16BE();
            } else if(cp_info.tag == CONSTANT_Fieldref || cp_info.tag == CONSTANT_Methodref || cp_info.tag == CONSTANT_InterfaceMethodref) {
                cp_info.class_index = reader.nextUInt16BE();
                cp_info.name_and_type_index = reader.nextUInt16BE();
            } else if(cp_info.tag == CONSTANT_NameAndType) {
                cp_info.name_index = reader.nextUInt16BE();
                cp_info.descriptor_index = reader.nextUInt16BE();
            } else if(cp_info.tag == CONSTANT_MethodHandle) {
                cp_info.reference_kind = reader.nextUInt8();
                cp_info.reference_index = reader.nextUInt16BE();
            } else if(cp_info.tag == CONSTANT_MethodType) {
                cp_info.descriptor_index = reader.nextUInt16BE();
            } else if(cp_info.tag == CONSTANT_InvokeDynamic) {
                cp_info.bootstrap_method_attr_index = reader.nextUInt16BE();
                cp_info.name_and_type_index = reader.nextUInt16BE();
            } else {
                throw new FormatError("Unknown tag '" + cp_info.tag + "' in constant pool.");
            }

            constPool.push(cp_info);
        }
        return constPool;
    }

    function readInterfaces(cf, reader, interfacesCount) {
        var interfaceIndices = [];

        for(var i = 0; i < interfacesCount; i++) {
            var idx = reader.nextUInt16BE();

            // If invalid const pool index.
            if(idx >= (cf.constant_pool_count - 1) || cf.constant_pool[idx - 1].tag !== CONSTANT_Class_info) {
                throw new FormatError("Invalid interface index.");
            }
            interfaceIndices.push(idx);
        }

        return interfaceIndices;
    }

    function readFields(reader, fieldsCount) {
        var fields = [];

        for(var i = 0; i < fieldsCount; i++) {
            var field_info = {};

            field_info.access_flags = reader.nextUInt16BE();
            field_info.name_index = reader.nextUInt16BE();
            field_info.descriptor_index = reader.nextUInt16BE();
            field_info.attributes_count = reader.nextUInt16BE();
            field_info.attributes = readAttributes(reader, field_info.attributes_count);

            fields.push(field_info);
        }

        return fields;
    }

    function readAttributes(reader, attributesCount) {
        var attributes = [];
        for(var i = 0; i < attributesCount; i++) {
            var attribute_info = {};
            attribute_info.attribute_name_index = reader.nextUInt16BE();
            attribute_info.attribute_length = reader.nextUInt16BE();
            attribute_info.info = [];

            for(var j = 0; j < attribute_info.attribute_length; j++) {
                // TODO: write this
            }
            attributes.push(attribute_info);
        }
        return attributes;
    }

    function bufferToArrayBuffer(buffer) {
        var arrayBuffer = new ArrayBuffer(buffer.length),
            view = new Uint8Array(arrayBuffer);

        for (var i = 0; i < buffer.length; ++i) {
            view[i] = buffer[i];
        }
        return arrayBuffer;
    }

    // TODO: do further research into surrogate pair handling.
    function getConstPoolUtf8(bytesArray) {
        var codePoints = [];
        for(var i = 0, charLength; i < bytesArray.length; i+= charLength) {
            var a = bytesArray[i], b, c;

            if((a >>> 7) === 0x0) {
                charLength = 1;
            } else if((a >>> 5) === 0x06) {
                charLength = 2;
            } else if((a >>> 4) === 0x0E) {
                charLength = 3;
            } else {
                throw new FormatError("Unrecognisable modified-UTF8 sequence.");
            }

            if(charLength == 1) {
                codePoints.push(a);
                continue;
            }

            // If expected more bytes than what is remaining.
            if((i + charLength) > bytesArray.length) {
                throw new FormatError("Unrecognisable modified-UTF8 sequence.");
            }

            // If byte b doesn't match bit pattern '10xxxxxx'.
            b = bytesArray[++i];
            if((b >>> 6) !== 0x02) {
                throw new FormatError("Unrecognisable modified-UTF8 sequence.");
            }

            if(charLength == 2) {
                codePoints.push(((a & 0x1F) << 6) | (b & 0x3F));
                continue;
            }

            c = bytesArray[++i];
            if((c >>> 6) != 0x02) {
                throw new FormatError("Unrecognisable modified-UTF8 sequence.");
            }
            codePoints.push(((a & 0x0F) << 12) | ((b & 0x3F) << 6) | (c & 0x3F));
        }
        var str = "";
        codePoints.forEach(function(c) { str += String.fromCharCode(c) });
        return str;
    }

    /**
     * An error thrown if the class file being read fails Format Checking (§4.8.)
     *
     * @param message
     * @constructor
     */
    function FormatError(message) {
        Error.call(this);
        if(Error.hasOwnProperty("captureStackTrace") && typeof Error.captureStackTrace === "function") {
            Error.captureStackTrace(this, this.constructor);
        }

        this.name = "FormatError";
        this.message = message || "FormatError";
    }
    FormatError.prototype = new Error();
    FormatError.prototype.constructor = FormatError;
}());
