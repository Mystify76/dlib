const dlib = require("./index");

console.log("UUID:", dlib.UUID());

console.log("date:", 1575172800000, new Date(1575172800000));
console.log("start:", dlib.startOfDay(1575172800000), new Date(dlib.startOfDay(1575172800000)));
console.log("start:", dlib.startOfDay(1575158400000), new Date(dlib.startOfDay(1575158400000)));
console.log("end:", dlib.endOfDay(1575172800000), new Date(dlib.endOfDay(1575172800000)));
