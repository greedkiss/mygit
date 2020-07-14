#!/usr/bin/env node


var fs = require("fs");
var nodepath = require("path");
const { throws } = require("assert");


var mygit = module.exports = {
    init: function(opts){
        console.log("haahah");

    }
    
}

//处理脚本参数，opts如下
// {
//   _: [
//     '/usr/local/bin/node',
//     '/home/flipped/project/my_git/mygit.js',
//     'init'
//   ],
//   a: true
// }
var parseOptions = function(argv){
    var name;
    return argv.reduce(function(opts, arg) {
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
    }, { _ : []});
};

var  runCli = function(argv){
    var opts = parseOptions(argv);
    var commandName = opts._[2];
    
    if(commandName === undefined){
        throw new Error("you must specify a command to run the code!");
    }else{
        var commandFnName = commandName.replace(/-/g,"_");
        var fn = mygit[commandFnName];

        if(fn === undefined){
            throw new Error("the function is not defined");
        }else{
            var commandArgs = opts._.slice(3);
            //function.length 代表形参个数
            while (commandArgs.length < fn.length - 1){
                commandArgs.push(undefined);
            }

            return fn.apply(mygit, commandArgs.concat(opts));
        }
    }
}

if(require.main === module){
    try{
        var result = runCli(process.argv);
        if(result　!== undefined){
            console.log(result);
        }
    }catch(e){
        console.error(e.toString());
    }
}
