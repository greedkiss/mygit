> 可以把js可执行文件加入到.bashrc配置文件中，这样就可以配置自己的git命令，如mygit
```
mygit init --[选项参数 bare]
mygit add a.txt
mygit commit -m "message"
mygit branch
mygit branch [new branch]
mygit checkout [new branch]
mygit remote add a ../a
mygit fetch a master
mygit merge FETCH_HEAD
mygit pull a master
mygit clone a b
mygit push a master
```
>最重要的一个部分
```
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
```
