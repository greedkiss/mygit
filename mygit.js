#!/usr/bin/env node


var fs = require("fs");
var nodepath = require("path");
const { rejects } = require("assert");


var mygit = module.exports = {
    init: function(opts){
        if(files.inRepo()) {
            console.log(files.inRepo());
            return;
        }

        opts = opts || {};

        var gitletStructure = {
            //当前的Branch
            HEAD: "ref: refs/heads/master\n",
            //[core]指定git的一些配置如 bare , filemode等
            //[user]指定git使用者的信息
            config: config.objToStr({core: {"" : { bare: opts.bare === true} }}),
            objects: {},
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

    rm: function(path, opts){
        files.assertInRepo();
        config.assertNotBare();
        opts = opts || {};

        var fileToRm = index.matchingFiles(path);

        if(opts.f){
            throw new Error("unsportted");

        } else if(fileToRm.length === 0){
            throw new Error(files.pathFromRepoRoot(path)+ "匹配不到文件");
        } else if(fs.existsSync(path) && fs.statSync(path).isDirectory() && !opts.r) {
            throw new Error("删除文件夹需要add -r");
        } else {
            var changesToRm = util.intersection(diff.addedOrModifiedFiles(), fileToRm);
            
        }
    

    },

    commit: function(opts){
        files.assertInRepo();
        config.assertNotBare();

        var treeHash = mygit.write_tree();
        var headDesc = refs.isHeadDetached() ? "detached HEAD" : refs.headBranchName();
        if(refs.hash("HEAD") !== undefined && 
            treeHash === objects.treeHash(objects.read(refs.hash("HEAD")))) {
                throw new Error("# on" + headDesc + " nothing commit");
        } else {
            var conflictedPaths = index.conflictedPaths();
            if (merge.isMergeInProgress() && conflictedPaths.length > 0) {
                throw new Error(conflictedPaths.map(function(p) { return "U " + p; }).join("\n") +
                                "\ncannot commit because you have unmerged files\n");
            }else{
                var m = merge.isMergeInProgress() ? files.read(files.gitletPath("MERGE_MSG")) : opts.m;
                var commitHash = objects.writeCommit(treeHash, m, refs.commitParentHashes());
                mygit.update_ref("HEAD", commitHash);
                if(merge.isMergeInProgress()) {
                    fs.unlinkSync(files.gitletPath("MERGE_MSG"));
                    refs.rm("MERGE_HEAD");
                    return "Merge made by the three-way strategy";
                }else {
                    return "[" + headDesc + " " + commitHash + "]" + m;
                }
            }
        }
    },

    branch: function(name, opts){
        files.assertInRepo();
        opts = opts || {};

        //返回的是当前所有的分支,活动分支用*标记
        if(name == undefined){
            return Object.keys(refs.localHeads()).map(function(branch){
                return (branch === refs.headBranchName() ? "* " : " ") + branch;
            }).join("\n") + "\n";
        }else if(refs.hash("HEAD") === undefined){
            throw new Error("project has no commit");
        }else if(refs.exists(refs.toLocateRef(name))){
            throw new Error("branch "+ name + " have already exited");
        }else {
            mygit.update_ref(refs.toLocateRef(name), refs.hash("HEAD"));
        }
    },

    checkout: function(ref, _){
        files.assertInRepo();
        config.assertNotBare();
        
        var toHash = refs.hash(ref);

        if(!objects.exists(toHash)){
            throw new Error(ref + " match nothing file");
        }else if(objects.type(objects.read(toHash)) !== "commit"){
            throw new Error(ref + "必须是commit类型");
        }else if(ref === refs.headBranchName() || ref === files.read(files.gitletPath("HEAD"))){
            return "already on " + ref;
    }else {
            var paths = diff.changeFilesCommitWouldOverWrite(toHash);
            if(paths.length>0){
                throw new Error("current branch hash been changed, if you change to another branch you will lose it");
            }else {
                //变更当前工作目录
                process.chdir(files.workingCopyPath());
                
                var isDetachingHead = objects.exists(ref);

                workingCopy.write(diff.diff(refs.hash("HEAD"), toHash));
                refs.write("HEAD", isDetachingHead? toHash : "ref: "+ refs.toLocateRef(ref));
                index.write(index.tocToIndex(objects.commitToc(toHash)));

                return isDetachingHead? 
                    "Note: checking out " + toHash + "\nYou are in detached HEAD state." :
                    "Switched to branch " + ref;
            }
        }
    },

    diff: function(ref1, ref2, opts){
        files.assertInRepo();
        config.assertNotBare();

       if(ref1 !== undefined && ref1.hash(ref1) === undefined){
           throw new Error("argument 1 has problems");
       } else if(ref2 !== undefined && refs.hash(ref2 === undefined)){
           throw new Error("argument 2 has problems");
       } else {
           var nameToStatus = diff.nameStatus(diff.diff(refs.hash(ref1), refs.hash(ref2)));

           return Object.keys(nameToStatus)
            .map(function(path) { return nameToStatus[path] + " " + path;})
            .join("\n") + "\n";
       }
    },

    remote: function(command, name, path, _){
        files.assertInRepo();

        if(command !== "add"){
            throw new Error("command wrong you fool");
        }else if(name in config.read()["remote"]){
            throw new Error("remote " + name  + " already exits");
        } else {
            config.write(util.setIn(config.read(), ["remote", name, "url", path]));
            return "\n";
        }
    },

    fetch: function(remote, branch, _){
        files.assertInRepo();

        if(remote === undefined || branch === undefined){
            throw new Error("error dump!");
        }else if(!(remote in config.read()[remote])){
            throw new Error("you must have remote when fetch");
        }else {
            var remoteUrl = config.read().remote.url;

            var remoteRef = refs.toRemoteRef(remote, branch);
            var newHash = util.onRemote(remoteUrl)(refs.hash, branch);

            if(newHash === undefined){
                throw new Error("remote ref can't find");
            } else {
                var oldHash = refs.hash(remoteRef);

                //从remote读并写入
                var remoteObjects = util.onRemote(remoteUrl)(objects.allObjects);
                remoteObjects.forEach(objects.write);
                
                mygit.update_ref(remoteRef, newHash);
                refs.write("FETCH_HEAD", newHash + " branch" + branch + " of" + remoteUrl);

                return ["From " + remoteUrl,
                "Count " + remoteObjects.length,
                branch + " -> " + remote + "/" + branch +
                (merge.isAForceFetch(oldHash, newHash) ? " (forced)" : "")].join("\n") + "\n";
            }
        }
    },

    merge: function(ref, _){
        files.assertInRepo();
        config.assertNotBare();

        var receiverHash = refs.hash("HEAD");

        var giverHash = refs.hash(ref);

        if(refs.isHeadDetached()){
            throw new Error("unsportted");
        }else if(giverHash === undefined || objects.type(objects.read(giverHash)) != "commit"){
            throw new Error(ref + "需要是commit类型");
        }else if(objects.isUpToDate(receiverHash, giverHash)){
            return "已经更新";
        }else {
            var paths = diff.changeFilesCommitWouldOverWrite(giverHash);
            if(paths.length>0){
                throw new Error("you fool ,you forget commit when you merge sth");
            }else if(merge.canFastForward(receiverHash, giverHash)){
                merge.writeFastForwardMerge(receiverHash, giverHash)
                return "Fast-forward";
            }else{
                merge.writeNonFastForwardMerge(receiverHash, giverHash, ref);

                if(merge.hasConflicts(receiverHash, giverHash)){
                    return "failed. fix the conflict";
                }else{
                    return mygit.commit();
                }
            }
        }
    },

    pull: function(remote, branch, _){
        files.assertInRepo();
        config.assertNotBare();
        mygit.fetch(remote, brach);
        return mygit.merge("FETCH_HEAD");
    },

    push: function(remote, branch, opts){
        files.assertInRepo();
        opts = opts || {};

        if(remote === undefined || branch === undefined) {
            throw new Error("unsportted");
        }else if(!(remote in config.read().remote)){
            throw new Error(remote+"do not exist");
        }else {
            var remotePath = config.read().remote[remote].url;
            var remoteCall = util.onRemote(remotePath);

            if(remoteCall (refs.isCheckedOut, branch)){
                throw new Error("refusing to update checked out branch " + branch);
            } else {
                var receiverHash = remoteCall(refs.hash, branch);

                var giverHash = refs.hash(brach);

                if(objects.isUpToDate(receiverHash, giverHash)){
                    return "already update";
                }else if(!opts.f && !merge.canFastForward(receiverHash, giverHash)){
                    throw new Error("failed to load"+ remotePath);
                }else {
                    remoteCall(gitlet.update_ref, refs.toLocalRef(branch), giverHash);

                    mygit.update_ref(refs.toRemoteRef(remote, branch), giverHash);
          
                    return ["To " + remotePath,
                            "Count " + objects.allObjects().length,
                            branch + " -> " + branch].join("\n") + "\n";
                }
            }
        }
    },

    status: function(){
        files.assertInRepo();
        config.assertNotBare();
        return status.toString();
    },

    clone: function(remotePath, targetPath, opts){
        opts = opts || {};

        if(remotePath === undefined || targetPath === undefined){
            throw new Error("未指明原目的");
        }else if (!fs.existsSync(remotePath) || !util.onRemote(remotePath)(files.inRepo)) {
            throw new Error("repository " + remotePath + " does not exist");
        } else if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).length > 0) {
            throw new Error(targetPath + " already exists and is not empty");
      
          // Otherwise, do the clone.
        }else{
            remotePath = nodePath.resolve(process.cwd(), remotePath);

            // If `targetPath` doesn't exist, create it.
            if (!fs.existsSync(targetPath)) {
              fs.mkdirSync(targetPath);
            }
            util.onRemote(targetPath)(function() {

                // Initialize the directory as a Gitlet repository.
                mygit.init(opts);
        
                // Set up `remotePath` as a remote called "origin".
                mygit.remote("add", "origin", nodePath.relative(process.cwd(), remotePath));
        
                // Get the hash of the commit that master is pointing at on
                // the remote repository.
                var remoteHeadHash = util.onRemote(remotePath)(refs.hash, "master");
        
                // If the remote repo has any commits, that hash will exist.
                // The new repository records the commit that the passed
                // `branch` is at on the remote.  It then sets master on the
                // new repository to point at that commit.
                if (remoteHeadHash !== undefined) {
                  mygit.fetch("origin", "master");
                  merge.writeFastForwardMerge(undefined, remoteHeadHash);
                }
              });
              return "cloning into" + targetPath;
        } 
    },

    write_tree: function(_){
        files.assertInRepo();
        return objects.writeTree(files.nestFlatTree(index.toc()));
    },

    update_ref: function(refToUpdate, refToUpdateTo, _){
        files.assertInRepo();

        var hash = refs.hash(refToUpdateTo)
        if(!objects.exists(hash)){
            throw new Error("not a valid SHA1");
        }else if(!refs.isRef(refToUpdate)){
            throw new Error("cannot lock the ref");
        }else if(objects.type(objects.read(hash)) !== "commit"){
            var branch = refs.terminalRef(refToUpdate);
            throw new Error(branch+" not a commit object");
        }else{
            refs.write(refs.terminalRef(refToUpdate), hash);
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

    //返回不为空的数组项
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
    },

    //a和b是两个数组
    intersection: function(a, b){
        return a.filter(function(e) {b.indexOf(e) !== -1});
    },

    //去掉arr中的重复元素
    unique: function(arr){
        return arr.reduce(function(a, b) {
            return a.indexOf(b) === -1 ? a.concat(b) : a;
        }, [])
    },

    //func.apply(thisarg, [argsarry])
    onRemote: function(remotePath){
        return function(fn) {
            var originalDir = process.cwd();
            process.chdir(remotePath);
            var result = fn.apply(null, Array.prototype.slice.call(arguments, 1));
            process.chdir(originalDir);
            return result;
        }
    },

    flatten: function(arr) {
        return arr.reduce(function(a, e) {
          return a.concat(e instanceof Array ? util.flatten(e) : e);
        }, []);
    },
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

    nestFlatTree: function(obj) {
        return Object.keys(obj).reduce(function(tree, wholePath){
            return util.setIn(tree, wholePath.split(nodepath.sep).concat(obj[wholePath]));
        }, {})
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
    },

    flattenNestedTree: function(tree, obj, prefix){
        if(obj == undefined) {return files.flattenNestedTree(tree, {}, "")};

        Object.keys(tree).forEach(function(dir){
            var path = nodepath.join(prefix, dir);
            if(util.isString(tree[dir])){
                obj[path] = tree[dir];
            }else {
                files.flattenNestedTree(tree[dir], obj, path);
            }
        });
        return obj;
    },

    rmEmptyDirs: function(path) {
        if (fs.statSync(path).isDirectory()) {
            fs.readdirSync(path).forEach(function(c) { files.rmEmptyDirs(nodePath.join(path, c)); });
            if (fs.readdirSync(path).length === 0) {
                fs.rmdirSync(path);
            }
        }
    }
}


var index = {
    conflictedPaths: function(){
        var idx = index.read();
        return Object.keys(idx)
        .filter(function(k) { return index.keyPieces(k).stage === 2; })
        .map(function(k) { return index.keyPieces(k).path; });
    },

    keyPieces: function(key) {
        var pieces = key.split(/,/);
        return { path: pieces[0], stage: parseInt(pieces[1]) };
    },

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

    toc: function(){
        var idx = index.read();
        return Object.keys(idx)
            .reduce(function(obj, k){return util.setIn(obj, k.split(",")[0], idx[k]);}, {});
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
            .map(function(k) {return k.split(",")[0] + " " + k.split(",")[1] + " " + index[k]})
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
    },

    //用\\替换\，转义两次
    matchingFiles: function(pathSpec){
        var searchPath = files.pathFromRepoRoot(pathSpec);
        return Object.keys(index.toc())
            .filter(function(p) {return p.match("^" + searchPath.replace(/\\/g, "\\\\"));});
    },

    toc: function() {
        var idx = index.read();
        return Object.keys(idx)
          .reduce(function(obj, k) { return util.setIn(obj, [k.split(",")[0], idx[k]]); }, {});
    },

    flattenNestedTree: function(tree, obj, prefix){
        if(obj === undefined) {return files.flattenNestedTree(tree, {}, "");}

        Object.keys(tree).forEach(function(dir) {
            var path = nodepath.join(prefix, dir);
            if(util.isString(tree[dir])){
                obj[path] = tree[dir];
            } else {
                files.flattenNestedTree(tree[dir], obj, path);
            }
        })
        return obj;
    },

    //返回idx[name]: hash
    //当前工作目录的filename: hash
    //经常与commit的hash做比较来判断是否更新文件
    workingCopyToc: function(){
       return Object.keys(index.read())
            .map(function(k) { return k.split(",")[0]; }) //取name
            .filter(function(p) { return fs.existsSync(files.workingCopyPath(p)); }) //判断文件是否存在
            .reduce(function(idx, p) {
                idx[p] = util.hash(files.read(files.workingCopyPath(p)))
                return idx;
            }, {});
    },

    // stage `0`.  eg: `{ "file1,0": hash(1), "src/file2,0": hash(2) }'
    tocToIndex: function(toc) {
        return Object.keys(toc)
        .reduce(function(idx, p) { return util.setIn(idx, [index.key(p, 0), toc[p]]); }, {});
    },

    writeConflict: function(path, receiverContent, giverContent, baseContent){
        if(baseContent !== undefined){
            index._writeStageEntry(path, 1, baseContent);
        }
        index._writeStageEntry(path, 2, receiverContent);

        index._writeStageEntry(path, 3, giverContent);
    }
}

var objects = {
    write: function(str){
        files.write(nodepath.join(files.gitletPath(), "objects", util.hash(str)), str);
        return util.hash(str);
    },

    isUpToDate: function(receiverHash, giverHash){
        return receiverHash !== undefined && 
            (receiverHash === giverHash || objects.isAncestor(receiverHash, giverHash));
    },

    writeTree: function(tree) {
        var treeObject = Object.keys(tree).map(function(key) {
          if (util.isString(tree[key])) {
            return "blob " + tree[key] + " " + key;
          } else {
            return "tree " + objects.writeTree(tree[key]) + " " + key;
          }
        }).join("\n") + "\n";
    
        return objects.write(treeObject);
      },

    //正则表达式\s表示空字符　空格　换行　制表符等
    treeHash: function(str){
        if(objects.type(str) === "commit")
            return str.split(/\s/)[1];
    },

    writeCommit: function(treeHash, message, parentHash){
        return objects.write("commit "+ treeHash + "\n"
                            + parentHash
                                .map(function(h) {return "parent "+ h + "\n";}).join()+
                                "Date:  " + new Date().toString() + "\n" +
                                "\n" +
                                "    " + message + "\n");
    },

    type: function(str){
        return {commit: "commit", tree: "tree", blob: "tree"}[str.split(" ")[0]] || "blob";
    },

    read: function(objectHash){
        if(objectHash !== undefined) {
            var objectHash = nodepath.join(files.gitletPath(), "objects", objectHash);
            if(fs.existsSync(objectHash)){
                return files.read(objectHash);
            } 
        }
    },

    exists: function(objectHash){
        return objectHash !== undefined && 
            fs.existsSync(nodepath.join(files.gitletPath(), "objects", objectHash));
    },

    //当前hash的filename: hash
    commitToc: function(hash){
        return files.flattenNestedTree(objects.fileTree(objects.treeHash(objects.read(hash))));
    },

    fileTree: function(treeHash, tree){
        if(tree === undefined ){return objects.fileTree(treeHash, {});}

        util.lines(objects.read(treeHash)).forEach(function(line){
            var lineTokens = line.split(/ /);
            tree[lineTokens[2]] = lineTokens[0] === "tree" ? 
                objects.fileTree(lineTokens[1], {}) :
                lineTokens[1];
        });
        return tree;
    },

    allObjects: function(){
        return fs.readdirSync(fils.gitletPath("objects")).map(objects.read);
    },

    isAncestor: function(descendentHash, ancestorHash) {
        return objects.ancestors(descendentHash).indexOf(ancestorHash) !== -1;
    },
    
    parentHashes: function(str) {
        if (objects.type(str) === "commit") {
          return str.split("\n")
            .filter(function(line) { return line.match(/^parent/); })
            .map(function(line) { return line.split(" ")[1]; });
        }
    },

    ancestors: function(commitHash) {
        var parents = objects.parentHashes(objects.read(commitHash));
        return util.flatten(parents.concat(parents.map(objects.ancestors)));
    },
}

var diff = {
    FILE_STATUS: {ADD: "A", MODIFY: "M", DELETE: "D", SAME: "SAME", CONFLICT: "CONFLICT"},
    addedOrModifiedFiles: function(){
        var headToc = refs.hash("HEAD")? objects.commitToc(refs.hash("HEAD")) : {};
        var wc = diff.nameStatus(diff.tocDiff(headToc, index.workingCopyToc()));
        return Object.keys(wc).filter(function(p) { return wc[p] !== diff.FILE_STATUS.DELETE; });
    },

    changeFilesCommitWouldOverWrite: function(hash){
        var headHash = refs.hash("HEAD");
        return util.intersection(Object.keys(diff.nameStatus(diff.diff(headHash))),
                                 Object.keys(diff.nameStatus(diff.diff(headHash, hash))));
    },

    nameStatus: function(dif){
        return Object.keys(dif)
            .filter(function(p) {return dif[p].status !== diff.FILE_STATUS.SAME; })
            .reduce(function(ns, p) {return util.setIn(ns, [p, dif[p].status]); }, {});
    },

    diff: function(hash1, hash2){
        var a = hash1 === undefined ? index.toc() : objects.commitToc(hash1);
        var b = hash2 === undefined ? index.workingCopyToc() : objects.commitToc(hash2);
        return diff.tocDiff(a, b);
    },

    //core part!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    tocDiff: function(receiver, giver, base){
        function fileStatus(receiver, giver, base){
            var receiverPresent = receiver !== undefined;
            var basePresent = base !== undefined;
            var giverPresent = giver !== undefined;
            if(receiverPresent && giverPresent && receiver !== giver){
                if(receiver !== base && giver !== base){
                    return diff.FILE_STATUS.CONFLICT;
                }else {
                    return diff.FILE_STATUS.MODIFY;
                }
            } else if(receiver === giver){
                    return diff.FILE_STATUS.SAME;
            } else if ((!receiverPresent && !basePresent && giverPresent) ||
                        (receiverPresent && !basePresent && !giverPresent)) {
                    return diff.FILE_STATUS.ADD;
            } else if ((receiverPresent && basePresent && !giverPresent) ||
                        (!receiverPresent && basePresent && giverPresent)) {
                    return diff.FILE_STATUS.DELETE;
            }
        };

        base = base || receiver;

        //得到一个包含所有版本的所有路径
        var paths = Object.keys(receiver).concat(Object.keys(base)).concat(Object.keys(giver));

        //receiver[p]是该文件的hash值，所以他是比hash值
        //但是此次项目不是根据内容来算hash的，是根据文件长度来算hash的
        //so attention
        return util.unique(paths).reduce(function(idx, p){
            return util.setIn(idx, [p, {
                status: fileStatus(receiver[p], giver[p], base[p]),
                receiver: receiver[p],
                base: base[p],
                giver: giver[p]
            }]);
        },{});
    }
}

var status = {

    toString: function() {
  
      // **untracked()** returns an array of lines listing the files not
      // being tracked by Gitlet.
      function untracked() {
        return fs.readdirSync(files.workingCopyPath())
            .filter(function(p) { return index.toc()[p] === undefined && p !== ".gitlet"; });
      };
  
      // **toBeCommitted()** returns an array of lines listing the files
      // that have changes that will be included in the next commit.
      function toBeCommitted() {
        var headHash = refs.hash("HEAD");
        var headToc = headHash === undefined ? {} : objects.commitToc(headHash);
        var ns = diff.nameStatus(diff.tocDiff(headToc, index.toc()));
        return Object.keys(ns).map(function(p) { return ns[p] + " " + p; });
      };
  
      // **notStagedForCommit()** returns an array of lines listing the
      // files that have changes that will not be included in the next
      // commit.
      function notStagedForCommit() {
        var ns = diff.nameStatus(diff.diff());
        return Object.keys(ns).map(function(p) { return ns[p] + " " + p; });
      };
  
      // **listing()** keeps `lines` (prefixed by `heading`) only if it's nonempty.
      function listing(heading, lines) {
        return lines.length > 0 ? [heading, lines] : [];
      }
  
      // Gather all the sections, keeping only nonempty ones, and flatten them
      // together into a string.
      return util.flatten(["On branch " + refs.headBranchName(),
                           listing("Untracked files:", untracked()),
                           listing("Unmerged paths:", index.conflictedPaths()),
                           listing("Changes to be committed:", toBeCommitted()),
                           listing("Changes not staged for commit:", notStagedForCommit())])
          .join("\n");
    }
  };

var refs = {
    commitParentHashes: function() {
        var headHash = refs.hash("HEAD");
    
        if (merge.isMergeInProgress()) {
          return [headHash, refs.hash("MERGE_HEAD")];
    
        } else if (headHash === undefined) {
          return [];
        } else {
          return [headHash];
        }
    },

    isCheckedOut: function(branch) {
        return !config.isBare() && refs.headBranchName() === branch;
    },
    //返回本地分支的名称和hash（commit类型）
    localHeads: function(){
        return fs.readdirSync(nodepath.join(files.gitletPath(), "refs", "heads"))
            .reduce(function(o, n){
                return util.setIn(o, [n, refs.hash(n)]);
            }, {});
    },
    //判断是不是分支

    isRef: function(ref){
        return ref !== undefined && 
            (ref.match("^refs/heads/[A-Za-z-]+$") ||
            ref.match("^refs/remotes/[A-Za-z-]+/[A-Za-z-]+$") ||
            ["HEAD", "FETCH_HEAD", "MERGE_HEAD"].indexOf(ref) !== -1);
    },

    //返回commit类型的sha1值
    hash: function(refOrHash) {
        if(objects.exists(refOrHash)){
            return refOrHash;
        }else {
            var terminalRef = refs.terminalRef(refOrHash);
            if(terminalRef === "FETCH_HEAD"){
                return refs.fetchHeadBranchToMerge(refs.headBranchName());
            }else if(refs.exists(terminalRef)){
                return files.read(files.gitletPath(terminalRef));
            }
        }
    },

    write: function(ref, content){
        if(refs.isRef(ref)){
            files.write(files.gitletPath(nodepath.normalize(ref)),content);
        }
    },

    isHeadDetached: function(){
        return files.read(files.gitletPath("HEAD")).match("refs") === null;
    },

    fetchHeadBranchToMerge: function(branchName){
        return util.lines(files.read(files.gitletPath("FETCH_HEAD")))
            .filter(function(l) { return l.match("^.+ branch " + branchName + " of"); })
            .map(function(l) { return l.match("^([^ ]+) ")[1]; })[0];
    },

    headBranchName: function() {
        if(!refs.isHeadDetached()){
            return files.read(files.gitletPath("HEAD")).match("refs/heads/(.+)")[1];
        }
    },

    //返回ref的相对于.gitlet的路径
    terminalRef(ref){
        if(ref === "HEAD" && !refs.isHeadDetached()) {
            return files.read(files.gitletPath("HEAD")).match("ref: (refs/heads/.+)")[1];
        } else if(refs.isRef(ref)){
            return ref;
        } else {
            return refs.toLocateRef(ref);
        }
    },

    toLocateRef: function(name) {
        return "refs/heads/" + name;
    },

    exists: function(ref){
        return refs.isRef(ref) && fs.existsSync(files.gitletPath(ref));
    },

    toRemoteRef: function(remote, name){
        return "refs/remote/"+ remote + "/" + name;
    }

}

var merge = {
    isMergeInProgress: function(){
        return refs.hash("MERGE_HEAD");
    },

    isAForceFetch: function(receiverHash, giverHash){
        return receiverHash !== undefined && !objects.isAncestor(giverHash, receiverHash);
    },

    //当receiver未定义也就是没有commit
    //或者they have relations
    //返回true
    canFastForward: function(receiverHash, giverHash){
        return receiverHash === undefined || objects.isAncestor(giverHash, receiverHash);
    },

    writeFastForwardMerge: function(receiverHash, giverHash){
        //在refs/heads/master写上当前的hash
        refs.write(refs.toLocateRef(refs.headBranchName()), giverHash);
        //在index写下当前文件的新hash
        index.write(index.tocToIndex(objects.commitToc(giverHash)));
        if(!config.isBare()){
            var receiverToc = receiverHash === undefined ? {} : objects.commitToc(receiverHash);

            workingCopy.write(diff.tocDiff(receiverToc, objects.commitToc(giverHash)));
        }

    },

    writeNonFastForwardMerge: function(receiverHash, giverHash, giverRef){
        //创建新文件MERGE_HEAD
        refs.write("MERGE_HEAD", giverHash);

        merge.writeMergeMsg(receiverHash, giverHash, giverRef);

        merge.writeIndex(receiverHash, giverHash);
        if(!config.isBare()){
            workingCopy.write(merge.mergeDiff(receiverHash, giverHash));
        }

    },

    writeIndex: function(receiverHash, giverHash){
        var mergeDiff = merge.mergeDiff(receiverHash, giverHash);
        index.write({});
        Object.keys(mergeDiff).forEach(function(p){
            if(mergeDiff[p].status == diff.FILE_STATUS.CONFLICT){
                index.writeConflict(p, 
                                    objects.read(mergeDiff[p].receiver),
                                    objects.read(mergeDiff[p].giver),
                                    objects.read(mergeDiff[p].base));
            }
        })
    },

    writeMergeMsg: function(receiverHash, giverHash, ref){
        var msg = "Merge "+ ref + " into  "+ refs.headBranchName();

        var mergeDiff = merge.mergeDiff(receiverHash, giverHash);
        var conflicts = objects.keys(mergeDiff)
            .filter(function(p) { return mergeDiff[p].status === diff.FILE_STATUS.CONFLICT});
        if(conflicts.length >0){
            msg += "\nConflicts:\n"+ conflicts.join("\n");
        }
        files.write(files.gitletPath("MERGE_MSG"), msg);
    },

    //amazing!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    mergeDiff: function(receiverHash, giverHash){
        return diff.tocDiff(objects.commitToc(receiverHash),
                            objects.commitToc(giverHash),
                            objects.commitToc(merge.commonAncestor(receiverHash, giverHash)));
    },

    commonAncestor: function(aHash , bHash){
        var sorted = [aHash, bHash].sort();
        aHash = sorted[0];
        bHash = sorted[1];
        var aAncestors = [aHash].concat(objects.ancestors(aHash));
        var bAncestors = [bHash].concat(objects.ancestors(bHash));
        return util.intersection(aAncestors, bAncestors);
    },

    hasConflicts: function(receiverHash, giverHash) {
        var mergeDiff = merge.mergeDiff(receiverHash, giverHash);
        return Object.keys(mergeDiff)
          .filter(function(p){return mergeDiff[p].status===diff.FILE_STATUS.CONFLICT }).length > 0
    }

}

var workingCopy = {

    write: function(dif) {
  
      function composeConflict(receiverFileHash, giverFileHash) {
        return "<<<<<<\n" + objects.read(receiverFileHash) +
          "\n======\n" + objects.read(giverFileHash) +
          "\n>>>>>>\n";
      };
  
      Object.keys(dif).forEach(function(p) {
        if (dif[p].status === diff.FILE_STATUS.ADD) {
          files.write(files.workingCopyPath(p), objects.read(dif[p].receiver || dif[p].giver));
        } else if (dif[p].status === diff.FILE_STATUS.CONFLICT) {
          files.write(files.workingCopyPath(p), composeConflict(dif[p].receiver, dif[p].giver));
        } else if (dif[p].status === diff.FILE_STATUS.MODIFY) {
          files.write(files.workingCopyPath(p), objects.read(dif[p].giver));
        } else if (dif[p].status === diff.FILE_STATUS.DELETE) {
          fs.unlinkSync(files.workingCopyPath(p));
        }
      });
  
      fs.readdirSync(files.workingCopyPath())
        .filter(function(n) { return n !== ".gitlet"; })
        .forEach(files.rmEmptyDirs);
    }
  };
    

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
