const fs                 = require('fs-extra');
const path               = require('path');

let file = fs.readFileSync("./index.js", "utf8");

let data = file.split("dlib.").map(obj => [obj.split("=").shift().trim(), obj.split("=").slice(1).join("=").trim()]);

let functionNames = data.map(obj => obj[0]);
let changes = [];
functionNames.forEach(func => {
  data = data.map(block => {
    if (block[0] !== func) {
      let before = block[1];
      block[1]   = block[1].split("\n").map(line => {
        if (!line.startsWith("/*") && !line.startsWith(" *")) {
          let re = new RegExp(`(\\s)?${func}(\\b)?`, "g");
          return line.replace(re, `\$1this.${func}\$2`);
        } else return line;
      }).join("\n");
      if (block[1] !== before) {
        changes.push({func: block[0], before, after: block[1]});
      }
    }
    return block;
  });
});

data = data.map(block => `${block[0]} = ${block[1]}`).join("\ndlib.");

fs.writeFileSync("./index-backup.js", file);
fs.writeFileSync("./index.js", data);


console.log("done");
