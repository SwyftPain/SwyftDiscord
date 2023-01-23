const WebSocket = require("ws");
const axios = require("axios");
var FormData = require("form-data");
const fs = require("fs");
const { EmbedBuilder } = require("./methods/builders/embedbuilder.js");

class SwyftDiscord {
  // set intents and partials
  constructor(intents, partials) {
    this.baseURL = "https://discord.com/api";
    this.ws = null;
    this.heartbeatInterval = null;
    this.intents =
      intents &&
      Object.entries(intents)
        .filter(([, value]) => value)
        .map(([key]) => key)
        .join(",");
    this.partials =
      partials &&
      Object.entries(partials)
        .filter(([, value]) => value)
        .map(([key]) => key)
        .join(",");
    this.onReadyCallback = null;
    this.collectionActive = false;
    this.collectedMessages = [];
    this.onMessage = this.onMessage.bind(this);
  }

  // Login to the bot
  async login(token) {
    this.token = token;
  }

  // Check for incoming discord messages
  async onMessage(callback) {
    this.ws = new WebSocket(
      `wss://gateway.discord.gg/?v=6&encoding=json&intents=${this.intents},${this.partials}`
    );

    // on start
    this.ws.onopen = () => {
      const data = {
        op: 2,
        d: {
          token: this.token,
          properties: {
            $os: "windows",
            $browser: "my_library",
            $device: "my_library",
          },
          presence: {
            status: "online",
            since: null,
            game: {
              name: "my_library",
            },
          },
        },
      };
      this.ws.send(JSON.stringify(data));

      if (this.onReadyCallback) {
        this.onReadyCallback();
      }
    };

    // on message
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.op === 0 && message.t === "MESSAGE_CREATE") {
        message.d.channel_id = message.d.channel_id;
        this.currentChannelID = message.d.channel_id;
        this.currentGuildID = message.d.guild_id;
        callback(message.d);
      } else if (message.op === 10) {
        this.startHeartbeat(message.d.heartbeat_interval);
      }
    };

    // on close
    this.ws.onclose = () => {
      clearInterval(this.heartbeatInterval);
    };

    // on error
    this.ws.onerror = (error) => {
      console.log(`WebSocket error: ${error}`);
    };
  }

  // start the heartbeat
  startHeartbeat(interval) {
    this.heartbeatInterval = setInterval(() => {
      this.ws.send(JSON.stringify({ op: 1, d: null }));
    }, interval);
  }

  // Do something when the bot is ready
  async onReady(callback) {
    this.onReadyCallback = callback;
  }

  // Send a message to a channel
  async sendMessage(channelID, message, options) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages`;
      let headers = { Authorization: `Bot ${this.token}` };
      let data = {};
      const formData = new FormData();
      if (typeof message === "string") {
        data.content = message;
      } else if (typeof message === "object") {
        options = message;
      }
      if (options) {
        if (options.embeds) {
          data.embeds = options.embeds.map((embed) => embed.embed);
          formData.append("payload_json", JSON.stringify(data));
        }
        if (options.attachments) {
          options.attachments.forEach((attachment, index) => {
            formData.append(
              `files[${index}]`,
              attachment.file,
              attachment.name
            );
          });
        }
        const send = await axios.post(url, formData, {
          headers: {
            ...headers,
            "Content-Type": "multipart/form-data",
          },
        });
        return send.data;
      }
      const send = await axios.post(url, data, {
        headers: {
          ...headers,
          "Content-Type": "multipart/form-data",
        },
      });
      return send.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Edit a message
  async editMessage(channelID, messageID, newMessage) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      await axios.patch(url, { content: newMessage }, { headers });
    } catch (err) {
      console.error(err);
    }
  }

  // Set bot activity
  async setActivity(status, type, activity) {
    let activityType;
    switch (type) {
      case "playing":
        activityType = 0;
        break;
      case "streaming":
        activityType = 1;
        break;
      case "listening":
        activityType = 2;
        break;
      case "watching":
        activityType = 3;
        break;
      case "competing":
        activityType = 5;
        break;
      default:
        activityType = 0;
        break;
    }
    let data = {
      op: 3,
      d: {
        since: null,
        activities: [
          {
            name: activity,
            type: activityType,
          },
        ],
        status: status,
        afk: false,
      },
    };
    try {
      this.ws.send(JSON.stringify(data));
    } catch (err) {
      console.error(err);
    }
  }

  // Get a user's avatar
  displayAvatarURL(user) {
    if (user.id && user.avatar) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    } else {
      throw new Error("User does not have an avatar or is not a valid user");
    }
  }

  // Collect messages
  async collectMessages(filter, max, time, callback, errorCallback) {
    if (this.collectionActive) {
      errorCallback("A collection is already active.");
      return;
    }
    this.collectionActive = true;
    this.collectedMessages = [];
    let collected = 0;
    let timeout = setTimeout(() => {
      this.collectionActive = false;
      this.ws.removeEventListener("message", onMessage);
      errorCallback("Collection timed out.");
    }, time);

    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (
        message.op === 0 &&
        message.t === "MESSAGE_CREATE" &&
        filter(message.d)
      ) {
        this.collectedMessages.push(message);
        collected++;
        if (collected === max) {
          clearTimeout(timeout);
          this.collectionActive = false;
          this.ws.removeEventListener("message", onMessage);
          callback(this.collectedMessages.map((m) => m.d));
        }
      }
    };
    this.ws.addEventListener("message", onMessage);
  }

  // Get messages from a channel
  async getMessages(channelID, amount) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages?limit=${amount}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const messages = await axios.get(url, { headers });
      return messages.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Delete a message
  async deleteMessages(channelID, amount) {
    if (!channelID) {
      throw new Error("channelID is required");
    }
    if (!amount) {
      throw new Error("amount is required");
    }
    if (amount < 0) {
      throw new Error("amount cannot be negative");
    }
    let messagesDeleted = 0;

    if (amount === 1) {
      try {
        const url = `${this.baseURL}/channels/${channelID}/messages?limit=1`;
        const headers = { Authorization: `Bot ${this.token}` };
        const { data } = await axios.get(url, { headers });
        if (data.length > 0) {
          const deleteUrl = `${this.baseURL}/channels/${channelID}/messages/${data[0].id}`;
          const deleteHeaders = {
            Authorization: `Bot ${this.token}`,
          };
          await axios.delete(deleteUrl, { headers: deleteHeaders });
          messagesDeleted = 1;
        }
      } catch (err) {
        console.log(err);
      }
    } else {
      // Fetch the last messages in the channel
      const url = `${this.baseURL}/channels/${channelID}/messages?limit=${amount}`;
      const headers = { Authorization: `Bot ${this.token}` };
      const { data } = await axios.get(url, { headers });
      const messageIds = data.map((message) => message.id);

      // Delete the messages
      if (messageIds.length > 0) {
        try {
          const deleteUrl = `${this.baseURL}/channels/${channelID}/messages/bulk-delete`;
          const deleteHeaders = {
            Authorization: `Bot ${this.token}`,
            "Content-Type": "application/json",
          };
          const deleteData = { messages: messageIds };
          const deleteResponse = await axios.post(deleteUrl, deleteData, {
            headers: deleteHeaders,
          });
          messagesDeleted = deleteResponse.data.message_count;
        } catch (err) {
          console.log(err);
        }
      }
    }
    return messagesDeleted;
  }

  // Get a user
  async getUser(userID) {
    try {
      let url = `${this.baseURL}/users/${userID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const user = await axios.get(url, { headers });
      return user.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get mentioned users
  async getMentionedUsers(message) {
    let mentionedUsers = [];
    for (let i = 0; i < message.mentions.length; i++) {
      let user = await this.getUser(message.mentions[i].id);
      mentionedUsers.push(user);
    }
    return mentionedUsers;
  }

  // get first mentioned user
  async getFirstMentionedUser(message) {
    let mentionedUsers = await this.getMentionedUsers(message);
    return mentionedUsers[0];
  }

  // get last mentioned user
  async getLastMentionedUser(message) {
    let mentionedUsers = await this.getMentionedUsers(message);
    return mentionedUsers[mentionedUsers.length - 1];
  }

  // get a guild id
  async getGuildID(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const channel = await axios.get(url, { headers });
      return channel.data.guild_id;
    } catch (err) {
      console.error(err);
    }
  }

  // get a member
  async getMember(userID) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/members/${userID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.get(url, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get mentioned members
  async getMentionedMembers(message) {
    let mentionedMembers = [];
    for (let i = 0; i < message.mentions.length; i++) {
      let guildID = await this.getGuildID(message.channel_id);
      let member = await this.getMember(guildID, message.mentions[i].id);
      mentionedMembers.push(member);
    }
    return mentionedMembers;
  }

  // get first mentioned member
  async getFirstMentionedMember(message) {
    let mentionedMembers = await this.getMentionedMembers(message);
    return mentionedMembers[0];
  }

  // get last mentioned member
  async getLastMentionedMember(message) {
    let mentionedMembers = await this.getMentionedMembers(message);
    return mentionedMembers[mentionedMembers.length - 1];
  }

  // get bot user
  async getBotUser() {
    try {
      let url = `${this.baseURL}/users/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const user = await axios.get(url, { headers });
      return user.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get channel
  async getChannel(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const channel = await axios.get(url, { headers });
      return channel.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get channel messages
  async getChannelMessages(channelID, amount) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages?limit=${amount}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const messages = await axios.get(url, { headers });
      return messages.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get channel message
  async getChannelMessage(channelID, messageID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const message = await axios.get(url, { headers });
      return message.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get emoji
  async getEmoji(emojiID) {
    try {
      let url = `${this.baseURL}/emojis/${emojiID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const emoji = await axios.get(url, { headers });
      return emoji.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild
  async getGuild(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const guild = await axios.get(url, { headers });
      return guild.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild channels
  async getGuildChannels(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/channels`;
      let headers = { Authorization: `Bot ${this.token}` };
      const channels = await axios.get(url, { headers });
      return channels.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild members
  async getGuildMembers(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/members`;
      let headers = { Authorization: `Bot ${this.token}` };
      const members = await axios.get(url, { headers });
      return members.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild roles
  async getGuildRoles(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/roles`;
      let headers = { Authorization: `Bot ${this.token}` };
      const roles = await axios.get(url, { headers });
      return roles.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild emojis
  async getGuildEmojis(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/emojis`;
      let headers = { Authorization: `Bot ${this.token}` };
      const emojis = await axios.get(url, { headers });
      return emojis.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild bans
  async getGuildBans(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/bans`;
      let headers = { Authorization: `Bot ${this.token}` };
      const bans = await axios.get(url, { headers });
      return bans.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild invites
  async getGuildInvites(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/invites`;
      let headers = { Authorization: `Bot ${this.token}` };
      const invites = await axios.get(url, { headers });
      return invites.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild integrations
  async getGuildIntegrations(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/integrations`;
      let headers = { Authorization: `Bot ${this.token}` };
      const integrations = await axios.get(url, { headers });
      return integrations.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild webhooks
  async getGuildWebhooks(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/webhooks`;
      let headers = { Authorization: `Bot ${this.token}` };
      const webhooks = await axios.get(url, { headers });
      return webhooks.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild audit logs
  async getGuildAuditLogs(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/audit-logs`;
      let headers = { Authorization: `Bot ${this.token}` };
      const auditLogs = await axios.get(url, { headers });
      return auditLogs.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild widget
  async getGuildWidget(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/widget`;
      let headers = { Authorization: `Bot ${this.token}` };
      const widget = await axios.get(url, { headers });
      return widget.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild widget settings
  async getGuildWidgetSettings(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/widget-settings`;
      let headers = { Authorization: `Bot ${this.token}` };
      const widgetSettings = await axios.get(url, { headers });
      return widgetSettings.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild vanity url
  async getGuildVanityURL(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/vanity-url`;
      let headers = { Authorization: `Bot ${this.token}` };
      const vanityURL = await axios.get(url, { headers });
      return vanityURL.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild widget image
  async getGuildWidgetImage(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/widget.png`;
      let headers = { Authorization: `Bot ${this.token}` };
      const widgetImage = await axios.get(url, { headers });
      return widgetImage.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild welcome screen
  async getGuildWelcomeScreen(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/welcome-screen`;
      let headers = { Authorization: `Bot ${this.token}` };
      const welcomeScreen = await axios.get(url, { headers });
      return welcomeScreen.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild preview
  async getGuildPreview(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/preview`;
      let headers = { Authorization: `Bot ${this.token}` };
      const preview = await axios.get(url, { headers });
      return preview.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get role
  async getRole(roleID) {
    try {
      const headers = { Authorization: `Bot ${this.token}` };
      const { data } = await axios.get(
        `${this.baseURL}/guilds/${this.currentGuildID}/roles`,
        { headers }
      );
      const role = data.find((r) => r.id === roleID);
      return role;
    } catch (err) {
      console.error(err);
    }
  }

  // get mentioned roles
  async getMentionedRoles(message) {
    const roles = message.mention_roles;
    const show = [];
    for (let i = 0; i < roles.length; i++) {
      const role = await this.getRole(roles[i]);
      show.push(role);
    }
    return show;
  }

  // get first mentioned role
  async getFirstMentionedRole(message) {
    const roles = message.mention_roles;
    const role = await this.getRole(roles[0]);
    return role;
  }

  // get last mentioned role
  async getLastMentionedRole(message) {
    const roles = message.mention_roles;
    const role = await this.getRole(roles[roles.length - 1]);
    return role;
  }

  // get mentioned channels
  async getMentionedChannels(message) {
    const channelIDs = message.content.match(/<#(\d+)>/g);
    if (!channelIDs) return [];
    const channels = await Promise.all(
      channelIDs.map(async (channelID) => {
        const id = channelID.match(/\d+/)[0];
        return await this.getChannel(id);
      })
    );
    return channels;
  }

  // get first mentioned channel
  async getFirstMentionedChannel(message) {
    const channelIDs = message.content.match(/<#(\d+)>/g);
    if (!channelIDs) return [];
    const id = channelIDs[0].match(/\d+/)[0];
    const channel = await this.getChannel(id);
    return channel;
  }

  // get last mentioned channel
  async getLastMentionedChannel(message) {
    const channelIDs = message.content.match(/<#(\d+)>/g);
    if (!channelIDs) return [];
    const id = channelIDs[channelIDs.length - 1].match(/\d+/)[0];
    const channel = await this.getChannel(id);
    return channel;
  }

  // create role
  async createRole(data) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/roles`;
      let headers = { Authorization: `Bot ${this.token}` };
      const role = await axios.post(url, data, { headers });
      return role.data;
    } catch (err) {
      console.error(err);
    }
  }

  // edit role
  async editRole(roleID, data) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/roles/${roleID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const role = await axios.patch(url, data, { headers });
      return role.data;
    } catch (err) {
      console.error(err);
    }
  }

  // delete role
  async deleteRole(roleID) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/roles/${roleID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const role = await axios.delete(url, { headers });
      return role.data;
    } catch (err) {
      console.error(err);
    }
  }

  // create channel
  async createChannel(data) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/channels`;
      let headers = { Authorization: `Bot ${this.token}` };
      const channel = await axios.post(url, data, { headers });
      return channel.data;
    } catch (err) {
      console.error(err);
    }
  }

  // edit channel
  async editChannel(channelID, data) {
    try {
      let url = `${this.baseURL}/channels/${channelID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const channel = await axios.patch(url, data, { headers });
      return channel.data;
    } catch (err) {
      console.error(err);
    }
  }

  // delete channel
  async deleteChannel(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const channel = await axios.delete(url, { headers });
      return channel.data;
    } catch (err) {
      console.error(err);
    }
  }

  // set channel permissions
  async setChannelPermissions(channelID, data) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/permissions`;
      let headers = { Authorization: `Bot ${this.token}` };
      const permissions = await axios.put(url, data, { headers });
      return permissions.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get channel permissions
  async getChannelPermissions(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/permissions`;
      let headers = { Authorization: `Bot ${this.token}` };
      const permissions = await axios.get(url, { headers });
      return permissions.data;
    } catch (err) {
      console.error(err);
    }
  }

  // set channel position
  async setChannelPosition(channelID, position) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/channels`;
      let headers = { Authorization: `Bot ${this.token}` };
      const data = { id: channelID, position };
      const channel = await axios.patch(url, data, { headers });
      return channel.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get channel invites
  async getChannelInvites(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/invites`;
      let headers = { Authorization: `Bot ${this.token}` };
      const invites = await axios.get(url, { headers });
      return invites.data;
    } catch (err) {
      console.error(err);
    }
  }

  // create channel invite
  async createChannelInvite(channelID, data) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/invites`;
      let headers = { Authorization: `Bot ${this.token}` };
      const invite = await axios.post(url, data, { headers });
      return invite.data;
    } catch (err) {
      console.error(err);
    }
  }

  // delete channel permission
  async deleteChannelPermission(channelID, overwriteID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/permissions/${overwriteID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const permission = await axios.delete(url, { headers });
      return permission.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get channel webhooks
  async getChannelWebhooks(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/webhooks`;
      let headers = { Authorization: `Bot ${this.token}` };
      const webhooks = await axios.get(url, { headers });
      return webhooks.data;
    } catch (err) {
      console.error(err);
    }
  }

  // kick member
  async kickMember(memberID) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/members/${memberID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.delete(url, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // ban member
  async banMember(memberID, data) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/bans/${memberID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.put(url, data, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // unban member
  async unbanMember(memberID) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/bans/${memberID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.delete(url, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // add role to member
  async addRoleToMember(memberID, roleID) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/members/${memberID}/roles/${roleID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.put(url, {}, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // remove role from member
  async removeRoleFromMember(memberID, roleID) {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/members/${memberID}/roles/${roleID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.delete(url, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }
}

module.exports = {
  SwyftDiscord,
  EmbedBuilder,
};
