(function () {

  var ConstPoolTag = module.exports.ConstPoolTag = {
    CLASS_INFO: 7,
    FIELD_REF: 9,
    METHOD_REF: 10,
    INTERFACE_METHOD_REF: 11,
    STRING: 8,
    INTEGER: 3,
    FLOAT: 4,
    LONG: 5,
    DOUBLE: 6,
    NAME_AND_TYPE: 12,
    UTF8: 1,
    METHOD_HANDLE: 15,
    METHOD_TYPE: 16,
    INVOKE_DYNAMIC: 18
  };

  var AccessFlag = module.exports.AccessFlag = {
    ACC_PUBLIC: 0x0001,
    ACC_PRIVATE: 0x0002,
    ACC_PROTECTED: 0x0004,
    ACC_STATIC: 0x0008,
    ACC_FINAL: 0x0010,
    ACC_SUPER: 0x0020,
    ACC_VOLATILE: 0x0040,
    ACC_TRANSIENT: 0x0080,
    ACC_VARARGS: 0x0080,
    ACC_INTERFACE: 0x0200,
    ACC_ABSTRACT: 0x0400,
    ACC_SYNTHETIC: 0x1000,
    ACC_ANNOTATION: 0x2000,
    ACC_ENUM: 0x4000
  };

  var utf8 = module.exports.utf8 = require('./modified_utf8')
    , utils = require('./utils');


  module.exports.read = function () {
    if (arguments.length !== 1) throw new Error("Invalid arguments.");

    if (typeof arguments[0] === "string") {
      return readClassFile(arguments[0]);
    } else if (arguments[0] instanceof ArrayBuffer) {
      return readArrayBuffer(arguments[0]);
    }

    throw new TypeError("Argument is not a valid file path or ArrayBuffer.");
  };

  function readClassFile(filePath) {
    var fs = require("fs")
      , dataBuffer = fs.readFileSync(filePath)
      , nativeBuffer = utils.bufferToArrayBuffer(dataBuffer);

    return readArrayBuffer(nativeBuffer);
  }

  function readArrayBuffer(dataBuffer) {
    if (!(dataBuffer instanceof ArrayBuffer)) {
      throw new TypeError("Buffer must be of type 'ArrayBuffer'.");
    }

    try {
      return parseClassFile(dataBuffer);
    } catch (e) {
      if (e instanceof RangeError) {
        throw new FormatError("Unexpected end of class file.");
      }
      throw e;
    }
  }

  function parseClassFile(dataBuffer) {
    var bufferReader = require("./buffer_reader")
      , reader = bufferReader(dataBuffer)
      , cf = {};

    // The magic item supplies the magic number identifying the class file format;
    // it has the value 0xCAFEBABE. (§4.1.)
    cf.magic_number = reader.nextUInt32BE();
    if (cf.magic_number !== 0xCAFEBABE) {
      throw new FormatError("Invalid magic_number.");
    }

    cf.minor_version = reader.nextUInt16BE();
    cf.major_version = reader.nextUInt16BE();

    cf.constant_pool_count = reader.nextUInt16BE();
    cf.constant_pool = parseConstantPool(reader, cf.constant_pool_count);

    cf.access_flags = reader.nextUInt16BE();
    // If the ACC_INTERFACE flag of this class file is set, its ACC_ABSTRACT flag must also be set (JLS §9.1.1.1).
    // Such a class file must not have its ACC_FINAL, ACC_SUPER or ACC_ENUM flags set.
    if (utils.isFlagSet(cf.access_flags, AccessFlag.ACC_INTERFACE)) {
      if (!utils.isFlagSet(cf.access_flags, AccessFlag.ACC_ABSTRACT)) {
        throw new FormatError("Invalid access_flags: ACC_ABSTRACT must be set if ACC_INTERFACE is set.");
      }
      if (utils.isFlagSet(cf.access_flags, AccessFlag.ACC_FINAL)
        || utils.isFlagSet(cf.access_flags, AccessFlag.ACC_SUPER)
        || utils.isFlagSet(cf.access_flags, AccessFlag.ACC_ENUM)) {

        throw new FormatError("Invalid access_flags: ACC_FINAL, ACC_SUPER, ACC_ENUM " +
          "cannot be set if ACC_INTERFACE is set.");
      }
    } else {
      // If the ACC_ANNOTATION flag is set, the ACC_INTERFACE flag must be set as well.
      if (utils.isFlagSet(cf.access_flags, AccessFlag.ACC_ANNOTATION)) {
        throw new FormatError("Invalid access_flags: ACC_INTERFACE must be set if ACC_ANNOTATION is set.");
      }

      // If the ACC_INTERFACE flag of this class file is not set, it may have any of the other flags set,
      // except the ACC_ANNOTATION flag.
      // However, such a class file cannot have both its ACC_FINAL and ACC_ABSTRACT flags set (JLS §8.1.1.2).
      if (utils.isFlagSet(cf.access_flags, AccessFlag.ACC_FINAL)
        && utils.isFlagSet(cf.access_flags, AccessFlag.ACC_ABSTRACT)) {

        throw new FormatError("Invalid access_flags: cannot have both ACC_FINAL and ACC_ABSTRACT set.");
      }
    }

    // The value of the this_class item must be a valid index into the constant_pool table.
    // The constant_pool entry at that index must be a CONSTANT_Class_info structure (§4.1.)
    cf.this_class = reader.nextUInt16BE();
    if (cf.this_class >= (cf.constant_pool_count - 1)
      || cf.constant_pool[cf.this_class - 1].tag !== ConstPoolTag.CLASS_INFO) {

      throw new FormatError("Invalid this_class index.");
    }

    cf.super_class = reader.nextUInt16BE();
    if (cf.super_class !== 0) {

      // If invalid const pool index.
      if (cf.super_class >= (cf.constant_pool_count - 1)
        || cf.constant_pool[cf.super_class - 1].tag !== ConstPoolTag.CLASS_INFO) {

        throw new FormatError("Invalid super_class index.");
      }

      // For an interface, [...] The constant_pool entry at that index must
      // be [...] representing the class Object. (§4.1.)
      if ((cf.access_flags & AccessFlag.ACC_INTERFACE) === AccessFlag.ACC_INTERFACE) {
        var super_class_cp = cf.constant_pool[cf.super_class - 1]
          , super_class_name_cp = cf.constant_pool[super_class_cp.name_index - 1];

        if ("java/lang/Object" !== utf8.bytesToString(super_class_name_cp.bytes)) {
          throw new FormatError("Invalid super_class index: interfaces can only have " +
            "'java/lang/Object' as a superclass.");
        }
      }
    } else {
      var this_class_cp = cf.constant_pool[cf.super_class - 1]
        , this_class_name_cp = cf.constant_pool[this_class_cp.name_index - 1];

      // If the value of the super_class item is zero, then this class file must represent the class Object,
      // the only class or interface without a direct superclass. (§4.1.)
      if (utils.isFlagSet(cf.access_flags, AccessFlag.ACC_INTERFACE)) {
        throw new FormatError("Invalid super_class index: interfaces must have " +
          "'java/lang/Object' as a superclass.");
      }
      if ("java/lang/Object" !== utf8.bytesToString(this_class_name_cp.bytes)) {
        throw new FormatError("Invalid super_class index: only class 'java/lang/Object' has no superclass.");
      }
    }

    cf.interfaces_count = reader.nextUInt16BE();
    cf.interfaces = parseInterfaces(cf, reader, cf.interfaces_count);

    cf.fields_count = reader.nextUInt16BE();
    cf.fields = parseFields(cf, reader, cf.fields_count);

    cf.methods_count = reader.nextUInt16BE();
    cf.methods = parseMethods(cf, reader, cf.methods_count);

    cf.attributes_count = reader.nextUInt16BE();
    cf.attributes = parseAttributes(cf, reader, cf.attributes_count);

    if (reader.hasMore()) {
      throw new FormatError("Unexpected bytes remaining at end of file.");
    }

    return cf;
  }

  function parseConstantPool(reader, constPoolCount) {
    var constPool = [];

    // The constant_pool table is indexed from 1 to constant_pool_count-1 (§4.1.)
    for (var idx = 1; idx <= (constPoolCount - 1); idx++) {
      var cp_info = new ConstPoolEntry(idx, reader.nextUInt8());

      //noinspection FallthroughInSwitchStatementJS
      switch (cp_info.tag) {
        case ConstPoolTag.UTF8:
          cp_info.length = reader.nextUInt16BE();
          cp_info.bytes = [];
          for (var j = 0; j < cp_info.length; j++) {
            var b = reader.nextUInt8();

            // No byte may have the value (byte)0 or lie in the range (byte)0xf0 - (byte)0xff. (§4.4.7.)
            if (b === 0 || (b >= 0xf0 && b <= 0xff)) {
              throw new FormatError("Illegal byte value.");
            }
            cp_info.bytes.push(b);
          }
          break;

        case ConstPoolTag.INTEGER:
        case ConstPoolTag.FLOAT:
          cp_info.bytes = reader.nextUInt32BE();
          break;

        case ConstPoolTag.LONG:
        case ConstPoolTag.DOUBLE:
          cp_info.high_bytes = reader.nextUInt32BE();
          cp_info.low_bytes = reader.nextUInt32BE();

          // 64-bit entries are considered to take up 2 const pool entries.
          // To keep our constant pool array consistent with the class file indexing, we will add
          // another const pool entry, with the correct tag but no high_bytes or low_bytes properties.
          constPool.push(cp_info);
          cp_info = new ConstPoolEntry(++idx, cp_info.tag);
          break;

        case ConstPoolTag.CLASS_INFO:
          cp_info.name_index = reader.nextUInt16BE();
          break;

        case ConstPoolTag.STRING:
          cp_info.string_index = reader.nextUInt16BE();
          break;

        case ConstPoolTag.FIELD_REF:
        case ConstPoolTag.METHOD_REF:
        case ConstPoolTag.INTERFACE_METHOD_REF:
          cp_info.class_index = reader.nextUInt16BE();
          cp_info.name_and_type_index = reader.nextUInt16BE();
          break;

        case ConstPoolTag.NAME_AND_TYPE:
          cp_info.name_index = reader.nextUInt16BE();
          cp_info.descriptor_index = reader.nextUInt16BE();
          break;

        case ConstPoolTag.METHOD_HANDLE:
          cp_info.reference_kind = reader.nextUInt8();
          cp_info.reference_index = reader.nextUInt16BE();
          break;

        case ConstPoolTag.METHOD_TYPE:
          cp_info.descriptor_index = reader.nextUInt16BE();
          break;

        case ConstPoolTag.INVOKE_DYNAMIC:
          cp_info.bootstrap_method_attr_index = reader.nextUInt16BE();
          cp_info.name_and_type_index = reader.nextUInt16BE();
          break;

        default:
          throw new FormatError("Unknown tag '" + cp_info.tag + "' in constant pool.");
      }

      constPool.push(cp_info);
    }

    return constPool;
  }

  function parseInterfaces(cf, reader, interfacesCount) {
    var interfaceIndices = [];

    for (var i = 0; i < interfacesCount; i++) {
      var idx = reader.nextUInt16BE();

      // If invalid const pool index.
      if (idx >= (cf.constant_pool_count - 1) || cf.constant_pool[idx - 1].tag !== ConstPoolTag.CLASS_INFO) {
        throw new FormatError("Invalid interface index.");
      }
      interfaceIndices.push(idx);
    }

    return interfaceIndices;
  }

  function parseFields(cf, reader, fieldsCount) {
    var fields = [];

    for (var i = 0; i < fieldsCount; i++) {
      var field_info = {};
      var flag = field_info.access_flags = reader.nextUInt16BE();

      // [...] a specific field of a class may have at most one of its ACC_PRIVATE, ACC_PROTECTED, and ACC_PUBLIC
      // flags set (JLS §8.3.1)
      if (!(utils.isFlagSet(flag, AccessFlag.ACC_PRIVATE)
        ^ utils.isFlagSet(flag, AccessFlag.ACC_PROTECTED)
        ^ utils.isFlagSet(flag, AccessFlag.ACC_PUBLIC))) {

        throw new FormatError("Field info access flag can have at most one of " +
          "ACC_PRIVATE, ACC_PROTECTED, and ACC_PUBLIC flags set.");
      }

      // [...] and must not have both its ACC_FINAL and ACC_VOLATILE flags set (JLS §8.3.1.4).
      if (utils.isFlagSet(flag, AccessFlag.ACC_FINAL) && utils.isFlagSet(flag, AccessFlag.ACC_VOLATILE)) {
        throw new FormatError("Field info access flag cannot have both ACC_FINAL and ACC_VOLATILE flags set.");
      }

      // All fields of interfaces must have their ACC_PUBLIC, ACC_STATIC, and ACC_FINAL flags set; they may have
      // their ACC_SYNTHETIC flag set and must not have any of the other flags in Table 4.4 set (JLS §9.3).
      // TODO: check if field type is interface.

      field_info.name_index = reader.nextUInt16BE();
      field_info.descriptor_index = reader.nextUInt16BE();

      // name_index and descriptor_index must be a CONSTANT_Utf8_info structure.
      if (field_info.name_index >= (cf.constant_pool_count - 1)
        || field_info.descriptor_index >= (cf.constant_pool_count - 1)
        || cf.constant_pool[field_info.name_index - 1].tag !== ConstPoolTag.UTF8
        || cf.constant_pool[field_info.descriptor_index - 1].tag !== ConstPoolTag.UTF8) {

        throw new FormatError("Field info properties name_index and descriptor_index must" +
          "point to CONSTANT_Utf8_info structure.");
      }

      // No two fields in one class file may have the same name and descriptor (§4.3.2).
      for (var j = 0; j < i; j++) {
        if (fields[j].name_index === field_info.name_index
          && fields[j].descriptor_index === field_info.descriptor_index) {
          throw new FormatError("Field info may not share name and descriptor index with any other field.");
        }
      }

      field_info.attributes_count = reader.nextUInt16BE();
      field_info.attributes = parseAttributes(cf, reader, field_info.attributes_count);

      fields.push(field_info);
    }

    return fields;
  }

  function parseMethods(cf, reader, methodsCount) {
    var methods = [];

    for (var i = 0; i < methodsCount; i++) {
      var method_info = {};

      method_info.access_flags = reader.nextUInt16BE();
      method_info.name_index = reader.nextUInt16BE();
      method_info.descriptor_index = reader.nextUInt16BE();
      method_info.attributes_count = reader.nextUInt16BE();
      method_info.attributes = parseAttributes(cf, reader, method_info.attributes_count);

      methods.push(method_info);
    }

    return methods;
  }

  function parseAttributes(cf, reader, attributesCount) {
    var attributes = [];

    for (var i = 0; i < attributesCount; i++) {
      var attribute_info = {};
      attribute_info.attribute_name_index = reader.nextUInt16BE();

      // The constant_pool entry at attribute_name_index must be a CONSTANT_Utf8_info structure (§4.4.7)
      if (attribute_info.attribute_name_index >= (cf.constant_pool_count - 1)
        || cf.constant_pool[attribute_info.attribute_name_index - 1].tag !== ConstPoolTag.UTF8) {

        throw new FormatError("Attribute info property attribute_name_index must " +
          "point to CONSTANT_Utf8_info structure.");
      }

      attribute_info.attribute_length = reader.nextUInt32BE();
      attribute_info.info = [];

      // Let's just push the info data into an array for now.
      // TODO: parse attribute info into proper structures.
      for (var j = 0; j < attribute_info.attribute_length; j++) {
        attribute_info.info.push(reader.nextUInt8());
      }

      attributes.push(attribute_info);
    }
    return attributes;
  }

  function ConstPoolEntry(index, tag) {
    this.index = index;
    this.tag = tag;
  }

  /**
   * An error thrown if the class file being read fails Format Checking (§4.8.)
   *
   * @param message
   * @constructor
   */
  function FormatError(message) {
    Error.call(this);
    //noinspection JSUnresolvedVariable
    if (Error.hasOwnProperty("captureStackTrace") && typeof Error.captureStackTrace === "function") {
      //noinspection JSUnresolvedFunction
      Error.captureStackTrace(this, this.constructor);
    }

    this.name = "FormatError";
    this.message = message || "FormatError";
  }

  FormatError.prototype = new Error();
  FormatError.prototype.constructor = FormatError;
}());
