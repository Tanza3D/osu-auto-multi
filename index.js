var ircClient = require('node-irc');
const readline = require('readline');
const colours = require('./colours');
const request = require('request');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});



const owner = "your username";
const mpid = "your multiplayer room id";
const apikey = "your api key";
const logToChat = true;
var starRating = 3;
var delay = 5;

var client = new ircClient('irc.ppy.sh', 6667, owner, 'username', "password");


var pack = [];
var index = 0;
var challenge = false;

var autoSelectNext = false;

function doLog(text, logToChatOverride = false) {
    console.log(text);
    if(logToChat == true && logToChatOverride == false) {
        client.say('#mp_' + mpid, "[BMPB] " + String(text).replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''))
    }
}

client.on('ready', function () {
    client.join('#mp_' + mpid);
    client.say('#mp_' + mpid, '[BMPB] Ready!');
});
client.on('CHANMSG', function (data) {
    /** 
        The data object contains
        data.receiver : The channel the message was written in prefixed with hash (#) 
        data.sender   : The nick of the person who sent the message
        data.message  : The message the person sent
    **/
    
    if(data.sender == owner) {
        var message = colours.FgRed + data.sender + " -> " + colours.FgCyan + data.message + colours.Reset;
        if(data.message.startsWith("$")) {
            var command = data.message.replace("$", "");
            var data = command.split(/ (.*)/);
            try {
                commands[data[0]](data[1]);
            } catch {
                doLog("(from chat): Command does not exist.");
            }
        }
    } else {
        var message = colours.FgYellow + data.sender + " -> " + colours.FgCyan + data.message + colours.Reset;
    }
    if(data.sender == "BanchoBot") {
        if(autoSelectNext && data.message == "The match has finished!") {
            doLog("Selecting next map in 15 seconds")
            setTimeout(function () {
            commands["next"]("");
            }, 15000);
        }
    }
    doLog(message, true); // dont log people's own messages back to them lol
});
function playMap(diffid) {
    client.say('#mp_' + mpid, '!mp map ' + diffid);
}
function setMods(mods) {
    client.say('#mp_' + mpid, '!mp mods ' + mods);
}
function play(time) {
    client.say('#mp_' + mpid, '!mp start ' + time);
}
async function getMap(id, difficulty = "auto") {
    // * auto: pick any difficulty above 3*
    // ! top: pick top difficulty
    return new Promise(function (resolve, reject) {
        var difficultyId = 0;
        var lastStar = 0;
        if (difficulty == "auto") {
            lastStar = 100;
        }
        request('https://osu.ppy.sh/api/get_beatmaps?k=' + apikey + '&s=' + id, function (error, response, body) {
            var diffs = JSON.parse(body);
            for (var x = 0; x < diffs.length; x++) {
                if (difficulty == "auto") {
                    if (diffs[x]['difficultyrating'] > starRating && diffs[x]['difficultyrating'] < lastStar) {
                        // find the smallest one, as long as it's above the specified star rating
                        lastStar = diffs[x]['difficultyrating'];
                        difficultyId = diffs[x]['beatmap_id'];
                    }
                }
                if (difficulty == "top") {
                    if (diffs[x]['difficultyrating'] > lastStar) {
                        lastStar = diffs[x]['difficultyrating'];
                        difficultyId = diffs[x]['beatmap_id'];
                    }
                }
            }
            resolve(difficultyId);
        });
    });
}

function getMatches(string, regex, index) {
    index || (index = 1); // default to the first capturing group
    var matches = [];
    var match;
    while (match = regex.exec(string)) {
      matches.push(match[index]);
    }
    return matches;
  }
  

async function getPack(id) {
    return new Promise(function (resolve, reject) {
        index = 0;
        request('https://osu.ppy.sh/beatmaps/packs/' + id, async function (error, response, body) {
            var data = body;
            var maps = [];
            var diff_ids = [];

            const re = /\<a href\=\"https:\/\/osu.ppy.sh\/beatmapsets\/(.*)\" class=\"beatmap-pack-items__link\"\>/g;
            maps = getMatches(body, re, 1);
            doLog(maps);

            if (data.includes("Difficulty reduction mods")) {
                challenge = true;
                // use getMap with difficutly "top"
            } else {
                challenge = false;
            }

            for(var x = 0; x < maps.length; x++) {
                var id = await getMap(maps[x]);
                diff_ids.push(id);
            }
            doLog(diff_ids);

            pack = diff_ids;
            resolve();
        });
    });
}
function playMapPackMap(diffid) {
    playMap(diffid);
    if(challenge) {
        setMods("");
    }else {
    setMods("DT NF");
    }
    play(delay);
}
client.connect()

var commands = {
    "map": async function (input) {
        doLog(colours.FgYellow + "> Setting map: " + input + colours.Reset);
        playMap(input);
    },
    "play": async function (input) {
        doLog(colours.FgYellow + "> Playing in : " + input + " seconds" + colours.Reset);
        play(input);
    },
    "mods": async function (input) {
        doLog(colours.FgYellow + "> Setting mods to " + input + colours.Reset);
        setMods(input);
    },
    "load-pack": async function (input) {
        doLog(colours.FgYellow + "> Getting pack maps..." + colours.Reset);
        await getPack(input).then(function () {
            doLog(colours.FgWhite + colours.BgGreen + "> Got pack maps! - " + pack + colours.Reset);
            commands["map"](pack[index]);
            index++;
        });
    },
    "next": async function (input) {
        commands["map"](pack[index]);
        index++;
    },
    "play-pack-map": async function (input) {
        playMapPackMap(pack[index-1]);
    },
    "autoselect": function (input) {
        if(input == "on") {
            autoSelectNext = true;
            doLog("Autoselect On");
        } else {
            autoSelectNext = false;
            doLog("Autoselect Off");
        }
    },
    "auto-star": function (input) {
        starRating = input;
    }
}

rl.on("line", async (text) => {
    var lines = text.split(/ (.*)/);
    var data = "";
    if (lines[1] != null) data = lines[1];
    try {
        await commands[lines[0]](data);
    } catch {
        doLog("command does not exist", true);
    }
})