const Discord = require('discord.js')
const Neko = require('nekos.life')

const Redis = require('ioredis')
const Database = require('sqlite-async')
const RateLimiter = require('async-ratelimiter')

const properties = require('properties')
const winston = require('winston')

const _client = new Discord.Client()
const _neko = new Neko()

// SQLite 3 queries
const CREATE_TABLE = 'CREATE TABLE IF NOT EXISTS channels (`_Guild` BLOB UNIQUE, _Channel BLOB UNIQUE);'
const INSERT_OR_REPLACE = 'INSERT OR REPLACE INTO channels (_Guild,_Channel) VALUES ($guild,$channel);'
const SELECT_FROM = 'SELECT * FROM channels WHERE _Guild=$guild LIMIT 1;'
const DELETE_FROM = 'DELETE FROM channels WHERE _Guild=$guild;'

// Bot commands
const _commands = {
    setchannel: {
        permission: 'ADMINISTRATOR',
        trigger: async function (message, args) {

            const limit = await _limiter.get({
                id: message.guild.id
            })

            if (!_config.debug && !limit.remaining) {
                _neko.sfw.OwOify({
                    text: `You've already changed the channel a while ago, please be patient`
                }).then(function (res) {
                    message.reply(`${res.owo}~`)
                })
                return
            }
            _store.run(INSERT_OR_REPLACE, {
                $guild: message.guild.id,
                $channel: message.channel.id
            }).then(() => {
                _logger.debug(`User ${message.author.tag} set the channel of ${message.guild.name} to #${message.channel.name}.`)
                _neko.sfw.OwOify({
                    text: `I'm now serving in {0} for you!`
                }).then(function (res) {
                    message.reply(`${res.owo}~`.replace('{0}', `<#${message.channel.id}>`))
                })
            })
        }
    }
}

properties.parse('./config.properties', {
    path: true
}, function (error, prop) {
    if (error) console.log(error)
    else {
        _config = prop
        start()
    }
})

var _logger
var _config
var _limiter
var _store

async function start() {

    _logger = winston.createLogger({
        level: _config.debug ? 'debug' : 'info',
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.splat(),
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }),
            new winston.transports.File({
                filename: 'log.txt',
                format: winston.format.combine(
                    winston.format.splat(),
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        ]
    })

    _limiter = new RateLimiter({
        db: new Redis(_config.redis),
        duration: 600000,
        max: 1
    })

    Database.open('store.db')
        .then(database => {
            _store = database
            _store.run(CREATE_TABLE).then(() => {
                _logger.debug(`Connected to sqlite-database ${_store.filename}`)
            })
        })
        .catch(error => {
            _logger.error(`Could not connect to sqlite-database ${_store.filename}: ${error.message}`)
            return
        })

    _client.login(_config.token)

    if (_config.debug)
        _logger.warn('This bot is running in \'DEBUG\' mode, consider disabling it if you notice any inconvenience.')

}

function isBotOwner(user) {
    return new Promise(function (fulfill, reject) {
        _client.fetchApplication()
            .then(application => fulfill(application.owner.id === user.id))
            .catch(error => {
                _logger.debug(`Could not fetch bot-owner status of ${user.tag}: ${error.message}`)
                fulfill(false)
            })
    })
}

_client.once('ready', async function () {

    _logger.info(`The Disord-client (${_client.user.tag}) logged in and is currently serving for ${_client.guilds.size} guild(s).`)

    _client.user.setPresence({
        game: {
            name: _config.debug ? 'debug-mode (Maintenance)' : '@nekos-chat~',
            type: _config.debug ? 'PLAYING' : 'LISTENING'
        },
        status: _config.debug ? 'dnd' : 'available'
    })

})

_client.on('guildCreate', async function (guild) {
    _logger.info(`Invited to guild: ${guild.name}`)
    guild.systemChannel.send({
        embed: {
            title: 'nekos-chat~',
            description: 'Allows you to communicate with \*real* [nekos.life](https://nekos.life) nekos!',
            color: 12390624,
            thumbnail: {
                url: _client.user.avatarURL
            },
            fields: [{
                    name: 'Setup',
                    value: `Just type ${_config.prefix}setchannel in the channel you want me to chill in.`
                },
                {
                    name: 'OpenSource',
                    value: '[GitHub](https://github.com/syntax-yt/NekosChat)',
                    inline: true
                },
                {
                    name: 'Endpoint',
                    value: '[nekos.life](https://nekos.life/api/v2/chat)',
                    inline: true
                }
            ]
        }
    }).catch(error => _logger.warn(`Could not send greeting to #${guild.defaultChannel.name} in ${guild.name}: ${error.message}`))
})

_client.on('guildDelete', async function (guild) {
    _logger.info(`Kicked from guild ${guild.name}`)
    _store.run(DELETE_FROM, {
            $guild: guild.id
        })
        .then(() => _logger.debug(`Deleted data for guild with id ${guild.id}.`))
        .catch(error => _logger.warn(`Could not delete data for guild with id ${guild.id}.`))
})

_client.on('error', async function (error) {
    _logger.error(`A discord-error ocurred: ${error.message}`)
})

_client.on('message', async function (message) {

    if (message.author.bot) {
        _logger.debug(`Ignored 'message' event #${message.id} because author of the message is not an user.`)
        return
    }

    if (!message.cleanContent.startsWith(_config.prefix)) {

        let mention = message.mentions.users.first()

        if (mention && _client.user.id === mention.id) {
            _store.get(SELECT_FROM, {
                $guild: message.guild.id
            }).then(res => {

                if (!res) return
                if (message.channel.id !== res['_Channel']) return

                let query = message.content.replace(/ *\<[^\]]*>/, '')

                if (!query.replace(/\s/g, '').length) {
                    message.channel.send({
                        embed: {
                            title: 'nekos-chat~',
                            description: 'Allows you to communicate with \*real* [nekos.life](https://nekos.life) nekos!',
                            thumbnail: {
                                url: _client.user.avatarURL
                            },
                            color: 12390624,
                            fields: [{
                                    name: 'OpenSource',
                                    value: '[GitHub](https://github.com/syntax-yt/NekosChat)',
                                    inline: true
                                },
                                {
                                    name: 'Endpoint',
                                    value: '[nekos.life](https://nekos.life/api/v2/chat)',
                                    inline: true
                                }
                            ]
                        }
                    })
                    return
                }

                _neko.sfw.chat({
                    text: query,
                    owo: Math.random() >= 0.5
                }).then(chat => {
                    message.reply(chat.response.replace(/ *\<[^\]]*>/, ''))
                })

            })
        }
        return
    }

    let args = message.cleanContent.toLowerCase().substr(_config.prefix.length).split(' ')
    if (args[0] === '') return

    isBotOwner(message.author).then(val => {

        if (_config.debug && !val) {
            _logger.debug(`Ignored 'message' event #${message.id} because author of the message is not the bot owner while the debug-mode is enabled.`)
            return
        }

        let command = _commands[args[0]]

        if (!command) {
            _neko.sfw.OwOify({
                text: 'Sorry but I don\'t know how to do that'
            }).then(function (res) {
                message.reply(`${res.owo}~`)
            })
            return
        }

        if (command.permission && !message.member.hasPermission(command.permission)) {
            _neko.sfw.OwOify({
                text: `Sorry but you're lacking some permissions`
            }).then(function (res) {
                message.reply(`${res.owo}~`)
            })
            return
        }

        try {
            command.trigger(message, args.shift())
        } catch (error) {
            _neko.sfw.OwOify({
                text: `Sorry but an internal error occurred`
            }).then(function (res) {
                message.reply(`${res.owo}~\`\`\`${error}\`\`\``)
            })
        }
    })
})
