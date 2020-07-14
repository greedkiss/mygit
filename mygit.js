#!/usr/bin/env node


var fs = require("fs");
var nodepath = require("path");
const { POINT_CONVERSION_UNCOMPRESSED } = require("constants");


var mygit = module.exports = {
    init: function(opts){
        fs.mkdirSync('letme', 777);
        console.log(fs.existsSync());

    }
    
}

var parseOptions = function(argv){
    var name;
    return argc.reduce(function(opts, arg) {
        if(arg.match(/^-/)){
            name = arg.replace(/^-+/, "");
            opts[name] = true;
        }else if(name !== undefined){
            opts[name] = arg;
            name = undefined;
        }else{
            opts._.push(arg);
        }

        return opts;
    }, {});
};


if(require.main === module){



}