java-cfr
=========

A Java class file reader written in JavaScript. It reads the contents of a Java class file, and returns the structure as a JavaScript object. It has been written in compliance with the [JVM specification](http://docs.oracle.com/javase/specs/jvms/se7/html/jvms-4.html) (Java SE 7).

Note: this project is incomplete and untested. Do not use for production code.

Usage
-------
An example usage within Node.js:

    var jcfr = require("./lib/jcfr");

    var json = jcfr.readFile("/path/to/file.class");
    console.log(json);


License
-------
You may use java-cfr under the terms of the MIT License (see [LICENSE](LICENSE)).
