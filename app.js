var jcr = require("./lib/jcfr"),
    AccessFlag = jcr.AccessFlag,
    ConstPoolTag = jcr.ConstPoolTag;

var clazz = jcr.readClassFile("");
console.log(JSON.stringify(clazz, null, 4));
