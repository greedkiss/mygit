#!/usr/bin/env node


var fs = require("fs");
var nodepath = require("path");
const { pathToFileURL } = require("url");


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
    },

    add: function(path, _){
        files.assertInRepo();
        config.assertNotBare();

        var addedFiles = files.lsRecurisive(path);

        if(addedFiles.length === 0){
            throw new Error("there is no such file");
        }else{
            addedFiles.forEach(function(p) { mygit.update_index(p, {add: true});})
        }
    },

    update_index: function(path, opts){
        files.assertInRepo();
        config.assertNotBare();
        opts = opts || {};

        var pathFromRoot = files.pathFromRepoRoot(path);
        var isOnDisk = fs.existsSync(path);
        var isInIndex = index.hasFile(path, 0);

        if(isOnDisk && fs.statSync(path).isDirectory()){
            throw new Error("only do with file");
        }else if(opts.remove && !isOnDisk && isInIndex){
            if(index.isFileInConflict(path)){
                throw new Error("unsported");
            }else{
                index.writeRm(path); 
                return "\n";
            }
        } else if(opts.remove && !isOnDisk && !isInIndex) {
            return "\n";
        } else if(!opts.add && isOnDisk && !isInIndex){
            throw new Error("cannot add"+ pathFromRoot);
        } else if(isOnDisk && (opts.add || isInIndex)){
            index.writeNonConflict(path, files.read(files.workingCopyPath(path)));
            return "\n";
        } else if(!opts.remove && !isOnDisk){
            throw new Error(pathFromRoot+"not exit or --remove is not define");
        }
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
    },

    read: function(){
        return config.strToObj(files.read(files.gitletPath("config")));
    },

    isBare: function(){
        // console.dir(config.read());
        return config.read().core[""].bare === "true";
    },

    assertNotBare: function(){
        if(config.isBare()){
            throw new Error("working in the work tree");
        }
    },

    // strToObj: function(str){
    //     return str.split("[")
    //         .map(function(item) {return item.trim();})
    //         .filter(function(item) {return item !== "";})
    //         .reduce(function(c, item){
    //             var lines = item.split("/n");
    //             var entry = [];

    //             //split消去了第一个[,所以这里是[1]
    //             entry.push(lines[0].match(/([^ \]]+)( |\])/)[1]);

    //             var subsectionMatch = lines[0].match(/\"(.+)\"/);
    //             var subsection = subsectionMatch === null ? "" : subsectionMatch[1];
    //             entry.push(subsection);

    //             entry.push(lines.slice[1].reduce(function(s, i){
    //                 s[i.split["="][0].trim()] = i.split["="][1].trim();
    //                 return s;
    //             },{}));

    //             return util.setIn(c, entry);
    //         } ,{ "remote": {}})
    // }
    strToObj: function(str) {
        return str.split("[")
        .map(function(item) { return item.trim(); })
        .filter(function(item) { return item !== ""; })
        .reduce(function(c, item) { 
            var lines = item.split("\n"); //[core] , bare : 
            var entry = [];

            // section eg "core"
            entry.push(lines[0].match(/([^ \]]+)( |\])/)[1]);

            // eg "master"
            var subsectionMatch = lines[0].match(/\"(.+)\"/);
            var subsection = subsectionMatch === null ? "" : subsectionMatch[1];
            entry.push(subsection);

            // options and their values
            entry.push(lines.slice(1).reduce(function(s, l) {
            s[l.split("=")[0].trim()] = l.split("=")[1].trim();
            return s;
            }, {}));

            return util.setIn(c, entry);
        }, { "remote": {} });
    },

}

var util = {
    setIn: function(obj, arr){
        if(arr.length === 2){
            obj[arr[0]] = arr[1];
        }else if(arr.length > 2){
            obj[arr[0]] = obj[arr[0]] || {};
            util.setIn(obj[arr[0]], arr.slice(1));
        }
        return obj;
    },

    isString: function(thing){
        return typeof thing === "string";
    },

    lines: function(str){
        return str.split("\n").filter(function(l) { return l !== "";})
    },

    hash: function(string){
        var hashInt = 0;
        for(var i = 0; i < string.length; i++){
            hashInt = hashInt*31 + string.charCodeAt(i);
            hashInt = hashInt | 0;
        }
        return Math.abs(hashInt).toString(16);
    }

}


var files = {
    inRepo: function(){
        return files.gitletPath() !== undefined;
    },

    assertInRepo: function(){
        if(!files.inRepo()){
            throw new Error("not a git project");
        }
    },

    //读文件
    read: function(path){
        if(fs.existsSync(path)){
            return fs.readFileSync(path, "utf8");
        }
    },

    write: function(path, content){
        var prefix = require("os").platform() == "win32" ? "." : "/";
        files.writeFilesFromTree(util.setIn({}, path.split(nodepath.sep).concat(content)), prefix);
    },

    pathFromRepoRoot: function(path){
        return nodepath.relative(files.workingCopyPath(), nodepath.join(process.cwd(), path));
    },

    workingCopyPath: function(path){
        return nodepath.join(nodepath.join(files.gitletPath(), ".."), path|| "");
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
    },

    lsRecurisive: function(path){
        if(!fs.existsSync(path)){
            return [];
        }else if(fs.statSync(path).isFile()){
            return [path];
        }else if(fs.statSync(path).isDirectory()){
            return fs.readdirSync(path).reduce(function(fileList, dirChild){
                return fileList.concat(files.lsRecurisive(nodepath.join(path, dirChild)));
            }, []);
        }
    }


}


var index = {
    hasFile: function(path, stage){
        return index.read()[index.key(path, stage)] !== undefined;
    },

    read: function() {
        var indexFilePath = files.gitletPath("index");
        return util.lines(fs.existsSync(indexFilePath) ? files.read(indexFilePath):"\n")
            .reduce(function(idx, blobstr){
                var blobData = blobstr.split(/ /);
                idx[index.key(blobData[0], blobData[1])] = blobData[2];
                return idx;
            }, {});
    },

    key: function(path, stage){
        return path + "," + stage;
    },

    isFileInConflict: function(path){
        return index.hasFile(path, 2);
    },

    writeRm: function(path){
        var idx = index.read();
        [0, 1, 2, 3].forEach(function(stage) {delete idx[index.key(path, stage)];});
        index.write(idx);
    },

    write: function(index){
        var indexStr = Object.keys(index)
            .map(function(k) {return k.split(",")[0] + " " + k.split[1] + " " + index[k]})
            .join("\n") + "\n";
        files.write(files.gitletPath("index"), indexStr);
    },

    writeNonConflict: function(path, content){
        index.writeRm(path);
        index._writeStageEntry(path, 0 ,content);
    },

    _writeStageEntry: function(path, stage, content){
        var idx = index.read();
        idx[index.key(path, stage)] = objects.write(content);
        index.write(idx);
    }
}

var objects = {
    write: function(str){
        files.write(nodepath.join(files.gitletPath(), "objects", util.hash(str)), str);
        return util.hash(str);
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
