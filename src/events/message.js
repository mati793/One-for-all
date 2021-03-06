const xpCooldown = {};

const Constants = require("../utility/Constants");
const Event = require("../structures/Event");

module.exports = class extends Event {
    constructor(...args) {
        super(...args);
    }

    async execute(message) {
        const startAt = Date.now();
        if (message.author.bot) return;
        if (message.channel.type === "dm") {
            if (!message.content.startsWith(this.client.config.prefix)) return;

            const args = message.content
                .slice(this.client.config.prefix.length)
                .trim()
                .split(/ +/g);

            const commandName = args.shift().toLowerCase();
            const command = await this.client.commands.fetch(commandName);

            if (!command) return message.error("misc:UNKNOWN_COMMAND", {
                prefix: this.client.config.prefix,
                command: commandName
            });

            if (command.guildOnly) return message.error("misc:COMMAND_GUILDONLY");

            command.execute(message, args, {
                processTime: Date.now()-startAt
            });
        } else {
            if (
                !message.guild.available ||
                !message.channel
                    .permissionsFor(message.guild.me)
                    .has("SEND_MESSAGES")
            )
                return;

            const userPermissions = message.userPermissions = await this.client.handlers.permissions.fetch(
                message.guild,
                message.author.id
            );
            const actualUserPermissions = message.actualUserPermissions = await this.client.handlers.permissions.fetch(
                message.guild,
                message.author.id,
                true
            );

            // Check guild settings
            const guild = (message.guild.settings = await this.client.handlers.database.fetchGuild(
                message.guild.id
            ));

            if (
                new RegExp(`^<@!?${this.client.user.id}>$`).test(
                    message.content
                )
            )
                return message.reply(
                    message.translate("misc:PREFIX", { prefix: guild.prefix })
                );

            if (
                guild.plugins.automod.enabled &&
                !guild.plugins.automod.ignored.includes(message.channel.id)
            ) {
                if (
                    /(discord\.(gg|io|me|li)\/.+|discordapp\.com\/invite\/.+)/i.test(
                        message.content
                    )
                ) {
                    if (
                        userPermissions.level <
                        Constants.PermissionsLevels.SERVER_MODERATOR
                    ) {
                        message.delete();
                        message.author.send("```" + message.content + "```");
                        return message.sendT(
                            "moderation/automod:INVITE_POSTED",
                            { user: message.author }
                        );
                    }
                }
            }
            // Slowmode
            // Reply to @someone mentions
            if (message.content === "@someone" && message.guild) {
                return client.commands.get("someone").execute(message);
            }
            if (
                userPermissions.level ===
                Constants.PermissionsLevels.SERVER_BLACKLISTED
            )
                return;

            updateXp(message.member);

            if (
                !message.member.hasPermission("MANAGE_MESSAGES") &&
                guild.ignoredChannels.includes(message.channel.id)
            )
                return;

            if (!message.content.startsWith(guild.prefix)) return;

            const args = message.content
                .slice(guild.prefix.length)
                .trim()
                .split(/ +/g);
            const cmdName = args.shift().toLowerCase();
            const command = await this.client.commands.fetch(cmdName, guild);
            if (!command) {
                const customCommandAnswer = guild.customCommands.get(cmdName);
                if (customCommandAnswer)
                    message.channel.send(customCommandAnswer);
                return;
            }

            if (
                guild.ignoredChannels.includes(message.channel.id) &&
                !message.member.hasPermission("MANAGE_MESSAGES")
            ) {
                return (
                    message.delete() &&
                    message.author.send(
                        message.translate("misc:CHANNEL_IGNORED", {
                            channel: message.channel
                        })
                    )
                );
            }

            if (
                userPermissions.level <
                    Constants.PermissionsLevels.SERVER_MODERATOR &&
                (message.content.includes("@everyone") ||
                    message.content.includes("@here"))
            ) {
                return message.error("misc:EVERYONE_MENTION");
            }

            if (!message.channel.nsfw && command.nsfw) {
                return message.error("NSFW");
            }

            if (
                userPermissions.level < command.userPermissionLevel ||
                (actualUserPermissions.level < command.userPermissionLevel &&
                    actualUserPermissions.level !==
                        Constants.PermissionsLevels.SERVER_BLACKLISTED &&
                    command.userPermissionLevel <=
                        Constants.PermissionsLevels.SERVER_OWNER)
            ) {
                const requiredLevel = this.client.handlers.permissions.levels.get(
                    command.userPermissionLevel
                );
                return message.error("misc:MISSING_PERMS", {
                    requiredLevel: requiredLevel.level,
                    requiredTitle: requiredLevel.title,
                    userLevel: actualUserPermissions.level,
                    userTitle: actualUserPermissions.title
                });
            }

            const requiredPermissions = command.clientPermissions.filter(
                perm =>
                    !message.channel.permissionsFor(message.guild.me).has(perm)
            );
            if (requiredPermissions.length > 0) {
                return message.error("misc:MISSING_PERMS_BOT", {
                    permissions: requiredPermissions
                        .map(p => "`" + p + "`")
                        .join(", ")
                });
            }

            console.log(`Request handled in ${Date.now() - startAt}ms`);
            command.execute(message, args, {
                processTime: Date.now()-startAt
            });
            guild.addCommandLog(
                command.name,
                message.channel.id,
                message.author.id,
                new Date()
            );
            // Auto delete mod commands
            if(guild.autoDeleteModCommands && command.category === "Moderation") message.delete();
        }
        /*

        

        if(message.guild){
            // Gets the data of the member
            let memberData = await client.findOrCreateMember({ id: message.author.id, guildID: message.guild.id });
            data.memberData = memberData;
        }

        let userData = await client.findOrCreateUser({ id: message.author.id });
        data.userData = userData;

        if(message.guild){

            await updateXp(message, data);

            if(!message.channel.permissionsFor(message.member).has("MANAGE_MESSAGES") && !message.editedAt){
                let channelSlowmode = data.guild.slowmode.channels.find((ch) => ch.id === message.channel.id);
                if(channelSlowmode){
                    let uSlowmode = data.guild.slowmode.users.find((d) => d.id === (message.author.id+message.channel.id));
                    if(uSlowmode){
                        if(uSlowmode.time > Date.now()){
                            message.delete();
                            let delay = message.language.convertMs(Math.ceil((uSlowmode.time - Date.now())));
                            return message.author.send(message.language.get("SLOWMODE_PLEASE_WAIT", delay, message.channel));
                        } else {
                            uSlowmode.time = channelSlowmode.time+Date.now();
                        }
                    } else {
                        data.guild.slowmode.users.push({
                            id: message.author.id+message.channel.id,
                            time: channelSlowmode.time+Date.now()
                        });
                    }
                    data.guild.markModified("slowmode.users");
                    await data.guild.save();
                }
            }



            let afkReason = data.userData.afk;
            if(afkReason){
                data.userData.afk = null;
                await data.userData.save();
                message.channel.send(message.language.get("AFK_DELETED", message.author));
            }

            message.mentions.users.forEach(async (u) => {
                let userData = await client.findOrCreateUser({ id: u.id });
                if(userData.afk){
                    message.channel.send(message.language.get("AFK_MEMBER", u, userData.afk));
                }
            });

        }

        // Gets the prefix
        let prefix = client.functions.getPrefix(message, data);
        if(!prefix){
            return;
        }

        let args = message.content.slice((typeof prefix === "string" ? prefix.length : 0)).trim().split(/ +/g);
        let command = args.shift().toLowerCase();
        let cmd = client.commands.get(command) || client.commands.get(client.aliases.get(command));
        
        if(!cmd){
            if(message.guild){
                let customCommand = data.guild.customCommands.find((c) => c.name === command);
                if(customCommand){
                    message.channel.send(customCommand.answer);
                }
            }
            return;
        }

        if(cmd.conf.guildOnly && !message.guild){
            return message.channel.send(language.get("ERR_GUILDONLY"));
        }

        if(message.guild){
            let neededPermission = [];
            if(!cmd.conf.botPermissions.includes("EMBED_LINKS")){
                cmd.conf.botPermissions.push("EMBED_LINKS");
            }
            cmd.conf.botPermissions.forEach((perm) => {
                if(!message.channel.permissionsFor(message.guild.me).has(perm)){
                    neededPermission.push(perm);
                }
            });
            if(neededPermission.length > 0){
                return message.channel.send(language.get("ERR_MISSING_BOT_PERMS", neededPermission.map((p) => `\`${p}\``).join(", ")));
            }
            neededPermission = [];
            cmd.conf.memberPermissions.forEach((perm) => {
                if(!message.channel.permissionsFor(message.member).has(perm)){
                    neededPermission.push(perm);
                }
            });
            if(neededPermission.length > 0){
                return message.channel.send(language.get("ERR_MISSING_MEMBER_PERMS", neededPermission.map((p) => `\`${p}\``).join(", ")));
            }
            if(data.guild.ignoredChannels.includes(message.channel.id) && !message.member.hasPermission("MANAGE_MESSAGES")){
                return (message.delete()) && (message.author.send(language.get("ERR_UNAUTHORIZED_CHANNEL", (message.channel))));
            }
    
            if(cmd.conf.permission){
                if(!message.member.hasPermission(cmd.conf.permission)){
                    return message.channel.send(message.language.get("INHIBITOR_PERMISSIONS", cmd.conf.permission));
                }
            }

            if(!message.channel.permissionsFor(message.member).has("MENTION_EVERYONE") && (message.content.includes("@everyone") || message.content.includes("@here"))){
                return message.channel.send(language.get("ERR_EVERYONE"));
            }
            if(!message.channel.nsfw && cmd.conf.nsfw){
                return message.channel.send(language.get("ERR_NOT_NSFW"));
            }
        }

        if(!cmd.conf.enabled){
            return message.channel.send(language.get("ERR_COMMAND_DISABLED"));
        }

        if(cmd.conf.ownerOnly && message.author.id !== client.config.owner.id){
            return message.channel.send(language.get("ERR_OWNER_ONLY"));
        }

        let uCooldown = cmdCooldown[message.author.id];
        if(!uCooldown){
            cmdCooldown[message.author.id] = {};
            uCooldown = cmdCooldown[message.author.id];
        }
        let time = uCooldown[cmd.help.name] || 0;
        if(time && (time > Date.now())){
            return message.channel.send(language.get("ERR_CMD_COOLDOWN", Math.ceil((time-Date.now())/1000)));
        }
        cmdCooldown[message.author.id][cmd.help.name] = Date.now() + cmd.conf.cooldown;

        client.logger.log(`${message.author.username} (${message.author.id}) ran command ${cmd.help.name}`, "cmd");

        let log = new this.client.logs({
            commandName: cmd.help.name,
            author: { username: message.author.username, discriminator: message.author.discriminator, id: message.author.id },
            guild: { name: message.guild ? message.guild.name : "dm", id: message.guild ? message.guild.id : "dm" }
        });
        log.save();

        if(!data.userData.achievements.firstCommand.achieved){
            data.userData.achievements.firstCommand.progress.now = 1;
            data.userData.achievements.firstCommand.achieved = true;
            data.userData.markModified("achievements.firstCommand");
            await data.userData.save();
            await message.channel.send({ files: [
                {
                    name: "unlocked.png",
                    attachment: "./assets/img/achievements/achievement_unlocked2.png"
                }
            ]});
        }

        try {
            cmd.run(message, args, data);
            if(cmd.help.category === "Moderation" && data.guild.autoDeleteModCommands){
                message.delete();
            }
        } catch(e){
            console.error(e);
            return message.channel.send(message.language.get("ERR_OCCURENCED"));
        }*/
    }
};

async function updateXp(member) {
    const isInCooldown = xpCooldown[member.id];
    if (isInCooldown && isInCooldown > Date.now()) return;
    const toWait = Date.now() + 60000;
    xpCooldown[member.id] = toWait;
    const memberData = await member.client.handlers.database.fetchMember(member.id, member.guild.id);
    memberData.updateExp(memberData.exp + Math.floor(Math.random() * (Math.floor(10) - Math.ceil(5))) + Math.ceil(5));
}
