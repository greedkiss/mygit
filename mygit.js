#!/usr/bin/env node


var fs = require("fs");
var nodepath = require("path");


var mygit = module.exports = {
    init: function(opts){
        if(files.inRepo()) {
            console.log(files.inRepo());
            return;
        }

        opts = opts || {};

        var gitletStructure = {
            //当前的Branch
            HEAD: "ref: refs/head/master\n",

            //[core]指定git的一些配置如 bare , filemode等
            //[user]指定git使用者的信息
            config: config.objToStr({core: {"" : { bare: opts.bare === true} }}),

            object: {},
            refs:{
                heads: {},
            }
        };

        files.writeFilesFromTree(opts.bare? gitletStructure: {".gitlet":gitletStructure}, process.cwd());
    }
}

var config = {
    //第一个reduce和map产生arr=[{section: core, subsection: ""}]
    //第二个map产生
    objToStr: function(configObj){
        return Object.keys(configObj)
            .reduce(function(arr, section){
                return arr.concat(
                    Object.keys(configObj[section])
                        .map(function(subsection){return {section: section, subsection:subsection}})
                );
            }, [])
            .map(function(entry) {
                var subsection = entry.subsection === ""? "" : " \""+ entry.subsection + "\"";
                var settings = configObj[entry.section][entry.subsection];
                return "[" + entry.section + subsection + "]\n" + 
                    Object.keys(settings)
                        .map(function(k){
                            return "    "+ k + " = " + settings[k];
                        }).join("\n") + "\n";
            }).join("");
    }

}


var files = {
    inRepo: function(){
        return files.gitletPath() !== undefined;
    },

    //读文件
    read: function(path){
        if(fs.existsSync(path)){
            return fs.readFileSync(path, "utf8");
        }
    },


    gitletPath: function(path){
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
    },

    writeFilesFromTree: function(tree, prefix){
        Object.keys(tree).forEach(function(name){
            var path = nodepath.join(prefix, name);
            if(util.isString(tree[name])){
                fs.writeFileSync(path, tree[name]);
            }else{
                if(!fs.existsSync(path)){
                    fs.mkdirSync(path, "777");
                }

                files.writeFilesFromTree(tree[name], path);
            }
        });
    }


}

var util = {
    isString: function(thing){
        return typeof thing === "string";
    },
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
