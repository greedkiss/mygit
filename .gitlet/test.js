#!/usr/bin/env node

var fs=require("fs");
var nodepath = require("path");

// var content = fs.readFileSync("./config", "utf-8");

var files = {
  read: function(path){
    return fs.readFileSync(path, "utf-8");
  }
}
// console.log(content);

// var next = content.split("\n");

// console.log(next);

// console.dir(next[0].match(/([^ \]]+)( |\])/));
function gitletPath(path){
  function gitletDir(dir){
      if(fs.existsSync(dir)){
          var potentialConfigFile = nodepath.join(dir, "config");
          var potentialGitletPath = nodepath.join(dir, ".gitlet");
          if(fs.existsSync(potentialConfigFile)&&
              fs.statSync(potentialConfigFile).isFile()&&
              files.read(potentialConfigFile).match(/\[core\]/)) {
                  return dir;
          } else if(fs.existsSync(potentialGitletPath)) {
              return potentialGitletPath;
          } else if(dir !== "/") {
              return gitletDir(nodepath.join(dir, ".."));
          }
      }
  };

  var gDir = gitletDir(process.cwd());
  if(gDir !== undefined){
      return nodepath.join(gDir, path || "");
  }
}

console.log(gitletPath());


console.log(process.cwd());

console.log("_________");

var i = 1213123;
console.log(i.toString(16));