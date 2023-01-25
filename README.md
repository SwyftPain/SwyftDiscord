# SwyftDiscord
 Discord Bot Library in Javascript

Still in development (but basic commands work)

Currently added methods are:

```
login
onReady
onMessage
onInteraction
setActivity
getMessages
sendMessage
editMessage
deleteMessages
collectMessages
displayAvatarURL
getUser
getMentionedUsers
getFirstMentionedUser
getLastMentionedUser
getMember
getMentionedMembers
getFirstMentionedMember
getLastMentionedMember
getBotUser
getGuildID
getGuild
getGuildChannels
getGuildMembers
getGuildRoles
getGuildEmojis
getGuildBans
getGuildInvites
getGuildIntegrations
getGuildWebhooks
getGuildAuditLogs
getGuildWidget
getGuildWidgetSettings
getGuildVanityURL
getGuildWidgetImage
getGuildWelcomeScreen
getGuildPreview
getChannel
getChannelMessages
getChannelMessage
getMentionedChannels
getFirstMentionedChannel
getLastMentionedChannel
createChannel
editChannel
deleteChannel
setChannelPermissions
getChannelPermissions
setChannelPosition
getChannelInvites
createChannelInvite
deleteChannelPermission
getChannelWebhooks
getEmoji
getRole
getMentionedRoles
getFirstMentionedRole
getLastMentionedRole
createRole
editRole
deleteRole
addRoleToMember
removeRoleFromMember
kickMember
banMember
unbanMember
modifyCurrentUser
sendDM
getSticker
getStickerPacks
listGuildStickers
getGuildSticker
createGuildSticker
modifyGuildSticker
deleteGuildSticker
modifyUserVoiceState
modifyCurrentUserVoiceState
modifyGuildWelcomeScreen
modifyGuildWidget
guildPrune
modifyGuildMFALevel
modifyGuildRolePositions
modifyCurrentUserNick
modifyCurrentMemberNick
modifyGuildMember
searchGuildMembers
listGuildMembers
listActiveGuildThreads
modifyGuildChannelPositions
modifyGuild
listGuildEmojis
getGuildEmoji
createGuildEmoji
modifyGuildEmoji
deleteGuildEmoji
listJoinedPrivateArchivedThreads
listPrivateArchivedThreads
listPublicArchivedThreads
listThreadMembers
getThreadMember
removeThreadMember
leaveThread
addThreadMember
joinThread
startThreadInForumChannel
startThreadWithoutMessage
startThreadFromMessage
unpinMessage
pinMessage
getPinnedMessages
triggerTypingIndicator
followAnnouncementChannel
deleteChannelPermission
deleteAllReactionsForEmoji
deleteAllReactions
getReactions
deleteUserReaction
deleteOwnReaction
createReaction
crosspostMessage
listAutoModerationRulesForGuild
getAutoModerationRule
createAutoModerationRule
modifyAutoModerationRule
deleteAutoModerationRule
createGlobalSlashCommands
createGuildSlashCommands
EmbedBuilder
ButtonBuilder,
SelectMenuBuilder,
ActionRowBuilder
TextInputBuilder,
ModalBuilder
onEditedMessage
onDeletedMessage
refreshApplicationCommands
refreshGlobalApplicationCommands
Collection
Cooldown
SlashCommandBuilder
SlashCommandOptionBuilder
SlashCommandSubcommandBuilder
SlashCommandSubcommandGroupBuilder
permissions
intents
partials
events
messageTypes
messageActivityTypes
messageFlags
messageNotificationLevels
buttonStyles
```

Embeds and attachments are supported.

```js
require("dotenv").config();
const { SwyftDiscord, EmbedBuilder } = require("swyftdiscord");
const fs = require("fs");

const intents = {
  guilds: true,
  guildMembers: true,
  guildBans: true,
  guildPresences: true,
  guildMessages: true,
  guildMessageReactions: true,
  guildMessageTyping: true,
  directMessages: true,
  directMessageReactions: true,
  directMessageTyping: true,
};

const partials = {
  members: true,
  users: true,
  channels: true,
  emojis: true,
  guilds: true,
  invites: true,
  roles: true,
};

const client = new SwyftDiscord(intents, partials);

client.onReady(() => {
  console.log("Ready!");
  client.setActivity("online", "watching", "SwyftDiscord");
});

client.onMessage(async (message) => {
  if (message.content === "!ping") {
    const embed = new EmbedBuilder();
    embed.setTitle("Pong!");
    // use createDisplayAvatarURL to get the avatar of the user
    const photo = fs.readFileSync("./test.jpeg");
    client.sendMessage(message.channel.id, "Pong", {
      embeds: [embed],
      attachments: [{ name: "test.jpeg", file: photo }],
    });
  }

  if (message.content.startsWith("!t")) {
    client.sendDM(message.author.id, "Hello there!");
  }
});

client.login(process.env.TOKEN);
```

Plans:

+ Split methods into separate files for better readability
+ Cover the rest of Discord API
+ Add typescript typings

Discord:

[join here](https://discord.gg/rZHnGsYkmu)