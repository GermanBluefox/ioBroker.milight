/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

var utils         = require(__dirname + '/lib/utils'); // Get common adapter utils
var stateCommands = require(__dirname + '/lib/commands');
var light         = null;
var zones         = [];
var commands;

var nameStates = {
    v6 :{
        basic: ['state', 'on', 'off', 'whiteMode', 'brightnessUp', 'brightnessDown', 'brightness', 'colorUp', 'colorDown', 'color', 'rgb', 'mode'],
        RGBWW: ['state', 'on', 'off', 'colorMode', 'whiteMode', 'nightMode', 'brightnessUp', 'brightnessDown', 'brightness', 'colorUp', 'colorDown', 'color', 'rgb', 'mode', 'modeSpeedUp', 'modeSpeedDown', 'link', 'unlink'],
        RGBW:  ['state', 'on', 'off', 'colorMode', 'whiteMode', 'nightMode', 'brightnessUp', 'brightnessDown', 'brightness', 'colorUp', 'colorDown', 'color', 'rgb', 'mode', 'modeSpeedUp', 'modeSpeedDown', 'link', 'unlink', 'saturationUp', 'saturationDown', 'saturation', 'colorTempUp', 'colorTempDown', 'colorTemp']
    },
    v5 :{
        basic: ['state', 'on', 'off', 'brightnessUp', 'brightnessDown', 'speedUp', 'speedDown', 'effectSpeedUp', 'effectSpeedDown'],
        RGBWW: ['state', 'on', 'off', 'allOn', 'allOff', 'maxBright', 'brightnessUp', 'brightnessDown', 'warmer', 'cooler'],
        RGBW:  ['state', 'on', 'off', 'colorMode', 'allOn', 'allOff', 'hue', 'rgb', 'whiteMode', 'nightMode', 'brightness', 'brightness2', 'effectModeNext', 'effectSpeedUp', 'effectSpeedDown']
    }

};

var adapter       = utils.adapter({
    name: 'milight',
    unload: function (cb) {
        if (light) {
            light.close();
            light = null;
        }
        if (typeof cb === 'function') cb();
    }
});

adapter.on('message', function (obj) {
    var wait = false;
    if (obj) {
        switch (obj.command) {
            case 'browse':
                var discoverBridges = require('node-milight-promise').discoverBridges;
                adapter.log.info('Discover bridges...');
                discoverBridges({
                    type: 'all'
                }).then(function (results) {
                    adapter.log.info('Discover bridges: ' + JSON.stringify(results));
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, results, obj.callback);
                });
                wait = true;
                break;

            default:
                adapter.log.warn('Unknown command: ' + obj.command);
                break;
        }
    }

    if (!wait && obj.callback) {
        adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
    }

    return true;
});

function splitColor(rgb) {
    if (!rgb) rgb = '#000000';
    rgb = rgb.toString().toUpperCase();
    if (rgb[0] === '#') rgb = rgb.substring(1);
    if (rgb.length < 6) rgb = rgb[0] + rgb[0] + rgb[1] + rgb[1] + rgb[2] + rgb[2];
    var r = parseInt(rgb[0] + rgb[1], 16);
    var g = parseInt(rgb[2] + rgb[3], 16);
    var b = parseInt(rgb[4] + rgb[5], 16);

    if (rgb.length >= 8) {
        return [r, g, b, parseInt(rgb[6] + rgb[7], 16)];
    } else {
        return [r, g, b];
    }
}

adapter.on('stateChange', function (id, state) {
    if (state && !state.ack && light) {
        var tmp = id.split('.');
        var dp = tmp.pop();
        var strZone = tmp.slice(2).join('.'); //ZoneX
        var zone;
        switch (strZone) {
            case 'zone1':
                zone = 1;
                break;
            case 'zone2':
                zone = 2;
                break;
            case 'zone3':
                zone = 3;
                break;
            case 'zone4':
                zone = 4;
                break;
            case 'zoneAll':
            default:
                zone = 0;
                break;
        }

        if (dp === 'rgb')        dp = 'colorRGB';
        if (dp === 'color')      dp = 'colorSet';
        if (dp === 'saturation') dp = 'saturationSet';
        if (dp === 'colorTemp')  dp = 'colorTempSet';

        if (adapter.config.version === '6') {
            if (dp === 'brightness') dp = 'brightnessSet';
            if (zones[zone]) {

                if (dp === 'colorMode') {
                    if (state.val === 'true' || state.val === true || state.val === 1 || state.val === 'on' || state.val === 'ON') {
                        adapter.log.debug('Send to zone ' + zone + ' whiteMode');
                        zones[zone].command('whiteMode', function (err) {
                            if (!err) {
                                adapter.setForeignState(id, true, true);
                            } else {
                                adapter.log.error('Cannot control: ' + err);
                            }
                        });
                    } else {
                        adapter.log.debug('Send to zone ' + zone + ' nightMode');
                        zones[zone].command('nightMode', function (err) {
                            if (!err) {
                                adapter.setForeignState(id, false, true);
                            } else {
                                adapter.log.error('Cannot control: ' + err);
                            }
                        });
                    }
                } else
                if (dp === 'state') {
                    if (state.val === 'true' || state.val === true || state.val === 1 || state.val === 'on' || state.val === 'ON') {
                        adapter.log.debug('Send to zone ' + zone + ' ON');
                        zones[zone].command('on', function (err) {
                            if (!err) {
                                adapter.setForeignState(id, true, true);
                            } else {
                                adapter.log.error('Cannot control: ' + err);
                            }
                        });
                    } else {
                        adapter.log.debug('Send to zone ' + zone + ' OFF');
                        zones[zone].command('off', function (err) {
                            if (!err) {
                                adapter.setForeignState(id, false, true);
                            } else {
                                adapter.log.error('Cannot control: ' + err);
                            }
                        });
                    }
                } else
                if (typeof zones[zone][dp] === 'function') {
                    var val;
                    if (dp === 'colorRGB') {
                        val = splitColor(state.val);
                        adapter.log.debug('Send to zone ' + zone + ' "' + dp + '": ' + JSON.stringify(val));
                    } else if (dp === 'brightnessSet') {
                        val = Math.round(parseFloat(state.val) / 100) * 255;
                        if (val < 0)   val = 0;
                        if (val > 255) val = 255;
                        adapter.log.debug('Send to zone ' + zone + ' "' + dp + '": ' + val);
                    } else {
                        val = parseInt(state.val, 10);
                        adapter.log.debug('Send to zone ' + zone + ' "' + dp + '": ' + val);
                    }
                    zones[zone].command(dp, val, function (err) {
                        if (!err) {
                            adapter.setForeignState(id, state.val, true);
                        } else {
                            adapter.log.error('Cannot control: ' + err);
                        }
                    });
                } else {
                    adapter.log.error('Unknown command: ' + dp);
                }
            } else {
                adapter.log.error('Zone is disabled');
            }
        } else {
            // version 5
            if (dp === 'colorMode') {
                if (state.val === 'true' || state.val === true || state.val === 1 || state.val === 'on' || state.val === 'ON') {
                    light.sendCommands(zones[zone].on(zone), zones[zone].rgbwMode(zone)).then(function () {
                        adapter.setForeignState(id, true, true);
                    }, function (err) {
                        adapter.log.error('Cannot control: ' + err);
                    });
                } else {
                    light.sendCommands(zones[zone].on(zone), zones[zone].whiteMode(zone)).then(function () {
                        adapter.setForeignState(id, true, true);
                    }, function (err) {
                        adapter.log.error('Cannot control: ' + err);
                    });
                }
            } else
            if (dp === 'state') {
                if (state.val === 'true' || state.val === true || state.val === 1 || state.val === 'on' || state.val === 'ON') {
                    adapter.log.debug('Send to zone ' + zone + ' ON');
                    light.sendCommands(zones[zone].on(zone), zones[zone].brightness(100), zones[zone].whiteMode(zone)).then(function () {
                        adapter.setForeignState(id, true, true);
                    }, function (err) {
                        adapter.log.error('Cannot control: ' + err);
                    });
                } else {
                    adapter.log.debug('Send to zone ' + zone + ' OFF');
                    light.sendCommands(zones[zone].off(zone)).then(function () {
                        adapter.setForeignState(id, false, true);
                    }, function (err) {
                        adapter.log.error('Cannot control: ' + err);
                    });
                }
            } else
            if (typeof zones[zone][dp] === 'function') {
                var val;
                if (dp === 'colorRGB') {
                    dp = 'rgb255';
                    val = splitColor(state.val);
                    adapter.log.debug('Send to zone ' + zone + ' "' + dp + '": ' + JSON.stringify(val));
                } else if (dp === 'brightness') {
                    if (val < 0)   val = 0;
                    if (val > 100) val = 100;
                    adapter.log.debug('Send to zone ' + zone + ' "' + dp + '": ' + val);
                } else {
                    val = parseInt(state.val, 10);
                    adapter.log.debug('Send to zone ' + zone + ' "' + dp + '": ' + val);
                }
                light.sendCommands(zones[zone][dp](val)).then(function () {
                    adapter.setForeignState(id, state.val, true);
                }, function (err) {
                    adapter.log.error('Cannot control: ' + err);
                });
            } else {
                adapter.log.error('Unknown command: ' + dp);
            }
        }
    }
});

adapter.on('ready', main);

function mergeObject(obj, cb) {
    adapter.getForeignObject(obj._id, function (err, _obj) {
        if (_obj) {
            var changed = false;
            for (var attr in obj) {
                if (!obj.hasOwnProperty(attr)) continue;

                if (typeof obj[attr] === 'object') {
                    for (var _attr in obj[attr]) {
                        if (obj[attr].hasOwnProperty(_attr) && (!_obj[attr] || _obj[attr][_attr] !== obj[attr][_attr])) {
                            _obj[attr] = _obj[attr] || {};
                            _obj[attr][_attr] = obj[attr][_attr];
                            changed = true;
                        }
                    }
                } else {
                    if (obj[attr] !== _obj[attr]) {
                        _obj[attr] = _obj[attr];
                        changed = true;
                    }
                }
            }
            if (changed) {
                adapter.setForeignObject(obj._id, _obj, function () {
                    cb && cb();
                });
            } else {
                cb && cb();
            }
        } else {
            adapter.setForeignObject(obj._id, obj, function () {
                cb && cb();
            });
        }
    });
}

function mergeObjects(objs, cb) {
    if (!objs || !objs.length) {
        if (typeof cb === 'function') {
            cb();
        }
        return;
    }
    mergeObject(objs.shift(), function () {
        setTimeout(mergeObjects, 0, objs, cb);
    });
}



function main() {
    adapter.config.commandRepeat = parseInt(adapter.config.commandRepeat, 10) || 2;

    if (!adapter.config.ip) {
        adapter.log.warn('No IP address defined');
        return;
    }
    if (adapter.config.version === '6') {
        adapter.setState('info.connection', false, true);
        light = new require(__dirname + '/lib/bridge.js')({
            ip:                     adapter.config.ip,
            port:                   parseInt(adapter.config.port, 10) || 5987,
            reconnectTimeout:       10000,
            disconnectTimeout:      10000,
            keepAliveTimeout:       10000,
            delayBetweenCommands:   50,
            commandRepeat:          adapter.config.commandRepeat,
            debug:                  true,
            log:                    {
                log:   function (text) {
                    adapter.log.debug(text);
                },
                error: function (text) {
                    adapter.log.error(text);
                }
            }
        });
        light.on('connected', function () {
            adapter.setState('info.connection', true, true);
        });
        light.on('disconnected', function () {
            adapter.setState('info.connection', false, true);
        });
        zones[0] = light.baseCtlFactory();
    } else {
        adapter.setState('info.connection', true, true);
        var Milight = require('node-milight-promise').MilightController;
        commands    = require('node-milight-promise').commands;
        light = new Milight({
            ip:                     adapter.config.ip,
            delayBetweenCommands:   50,
            commandRepeat:          adapter.config.commandRepeat
        });
    }
    var objs = [];
    var nameStatesV = nameStates['v' + adapter.config.version];
    for (var n = 0; n < nameStatesV.basic.length; n++) {
        if (!stateCommands[nameStatesV.basic[n]]) {
            adapter.log.error('Unknown command: ' + nameStatesV.basic[n]);
            continue;
        }
        var _obj = JSON.parse(JSON.stringify(stateCommands[nameStatesV.basic[n]]));
        if (!_obj) {
            adapter.log.error('Unknown state: ' + nameStatesV.basic[n]);
            continue;
        }
        _obj.common.name = 'All Zones ' + _obj.common.name;
        _obj._id = adapter.namespace + '.zoneAll.' + nameStatesV.basic[n];
        objs.push(_obj);
    }
    if (adapter.config.version === '6') {
        zones[0] = light.baseCtlFactory();
    } else {
        zones[0] = commands.rgb;
    }
    for (var z = 1; z <= 4; z++) {
        var type = adapter.config['zone' + z];
        var names = nameStatesV[type];
        if (names) {
            if (adapter.config.version === '6') {
                if (type === 'basic') {
                    zones[z] = light.baseCtlFactory();
                } else
                if (type === 'RGBW')  {
                    zones[z] = light.zoneCtlRGBWFactory(z);
                } else
                if (type === 'RGBWW') {
                    zones[z] = light.zoneCtlRGBWWFactory(z);
                }
            } else {
                if (type === 'basic') {
                    zones[z] = commands.rgb;
                } else
                if (type === 'RGBW')  {
                    zones[z] = commands.rgbw;
                } else
                if (type === 'RGBWW') {
                    zones[z] = commands.white;
                }
            }
            for (var s = 0; s < names.length; s++) {
                if (!stateCommands[names[s]]) {
                    adapter.log.error('State ' + names[s] + ' unknown');
                    continue;
                }
                var obj = JSON.parse(JSON.stringify(stateCommands[names[s]]));
                if (!obj) {
                    adapter.log.error('Unknown state: ' + names[s]);
                    continue;
                }
                obj.common.name = 'Zone ' + z + ' ' + obj.common.name;
                obj._id = adapter.namespace + '.zone' + z + '.' + names[s];
                objs.push(obj);
            }
        }
    }

    mergeObjects(objs, function () {
        adapter.subscribeStates('*');
    });
}
