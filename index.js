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

  // Check for incoming discord interactions (slash commands)
  async onInteraction(callback) {
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
      if (message.op === 0 && message.t === "INTERACTION_CREATE") {
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

  // Get a user's avatar
  displayAvatarURL(user) {
    if (user.id && user.avatar) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    } else {
      throw new Error("User does not have an avatar or is not a valid user");
    }
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

  // Modify Current User
  async modifyCurrentUser(data) {
    try {
      let url = `${this.baseURL}/users/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const user = await axios.patch(url, data, { headers });
      return user.data;
    } catch (err) {
      console.error(err);
    }
  }

  // send a message to a user via DM (requires user ID and message content)
  async sendDM(userID, content) {
    try {
      let url = `${this.baseURL}/users/@me/channels`;
      let headers = { Authorization: `Bot ${this.token}` };
      const data = { recipient_id: userID };
      const channel = await axios.post(url, data, { headers });
      const message = await this.sendMessage(channel.data.id, content);
      return message;
    } catch (err) {
      console.error(err);
    }
  }

  // get sticker
  async getSticker(stickerID) {
    try {
      let url = `${this.baseURL}/stickers/${stickerID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const sticker = await axios.get(url, { headers });
      return sticker.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get sticker pack
  async getStickerPacks() {
    try {
      let url = `${this.baseURL}/sticker-packs`;
      let headers = { Authorization: `Bot ${this.token}` };
      const pack = await axios.get(url, { headers });
      return pack.data;
    } catch (err) {
      console.error(err);
    }
  }

  // list guild stickers
  async listGuildStickers(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/stickers`;
      let headers = { Authorization: `Bot ${this.token}` };
      const stickers = await axios.get(url, { headers });
      return stickers.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get guild sticker
  async getGuildSticker(guildID, stickerID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/stickers/${stickerID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const sticker = await axios.get(url, { headers });
      return sticker.data;
    } catch (err) {
      console.error(err);
    }
  }

  // create guild sticker
  async createGuildSticker(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/stickers`;
      let headers = { Authorization: `Bot ${this.token}` };
      const sticker = await axios.post(url, data, { headers });
      return sticker.data;
    } catch (err) {
      console.error(err);
    }
  }

  // modify guild sticker
  async modifyGuildSticker(guildID, stickerID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/stickers/${stickerID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const sticker = await axios.patch(url, data, { headers });
      return sticker.data;
    } catch (err) {
      console.error(err);
    }
  }

  // delete guild sticker
  async deleteGuildSticker(guildID, stickerID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/stickers/${stickerID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const sticker = await axios.delete(url, { headers });
      return sticker.data;
    } catch (err) {
      console.error(err);
    }
  }

  // modify user voice state
  async modifyUserVoiceState(guildID, userID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/voice-states/${userID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const voiceState = await axios.patch(url, data, { headers });
      return voiceState.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Current User Voice State
  async modifyCurrentUserVoiceState(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/voice-states/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const voiceState = await axios.patch(url, data, { headers });
      return voiceState.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild Welcome Screen (welcome channel and description)
  async modifyGuildWelcomeScreen(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/welcome-screen`;
      let headers = { Authorization: `Bot ${this.token}` };
      const welcomeScreen = await axios.patch(url, data, { headers });
      return welcomeScreen.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild Widget
  async modifyGuildWidget(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/widget`;
      let headers = { Authorization: `Bot ${this.token}` };
      const widget = await axios.patch(url, data, { headers });
      return widget.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Guild Prune
  async guildPrune(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/prune`;
      let headers = { Authorization: `Bot ${this.token}` };
      const prune = await axios.post(url, data, { headers });
      return prune.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild MFA Level
  async modifyGuildMFALevel(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/mfa`;
      let headers = { Authorization: `Bot ${this.token}` };
      const mfaLevel = await axios.patch(url, data, { headers });
      return mfaLevel.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild Role Positions
  async modifyGuildRolePositions(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/roles`;
      let headers = { Authorization: `Bot ${this.token}` };
      const rolePositions = await axios.patch(url, data, { headers });
      return rolePositions.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Current User Nick
  async modifyCurrentUserNick(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/members/@me/nick`;
      let headers = { Authorization: `Bot ${this.token}` };
      const nick = await axios.patch(url, data, { headers });
      return nick.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Current Member Nick
  async modifyCurrentMemberNick(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/members/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const nick = await axios.patch(url, data, { headers });
      return nick.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild Member
  async modifyGuildMember(guildID, userID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/members/${userID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.patch(url, data, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Search Guild Members
  async searchGuildMembers(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/members/search`;
      let headers = { Authorization: `Bot ${this.token}` };
      const members = await axios.get(url, data, { headers });
      return members.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Guild Members
  async listGuildMembers(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/members`;
      let headers = { Authorization: `Bot ${this.token}` };
      const members = await axios.get(url, data, { headers });
      return members.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Active Guild Threads
  async listActiveGuildThreads(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/threads/active`;
      let headers = { Authorization: `Bot ${this.token}` };
      const threads = await axios.get(url, data, { headers });
      return threads.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild Channel Positions
  async modifyGuildChannelPositions(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/channels`;
      let headers = { Authorization: `Bot ${this.token}` };
      const channelPositions = await axios.patch(url, data, { headers });
      return channelPositions.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild
  async modifyGuild(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const guild = await axios.patch(url, data, { headers });
      return guild.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Guild Emojis
  async listGuildEmojis(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/emojis`;
      let headers = { Authorization: `Bot ${this.token}` };
      const emojis = await axios.get(url, { headers });
      return emojis.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Get Guild Emoji
  async getGuildEmoji(guildID, emojiID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/emojis/${emojiID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const emoji = await axios.get(url, { headers });
      return emoji.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create Guild Emoji
  async createGuildEmoji(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/emojis`;
      let headers = { Authorization: `Bot ${this.token}` };
      const emoji = await axios.post(url, data, { headers });
      return emoji.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild Emoji
  async modifyGuildEmoji(guildID, emojiID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/emojis/${emojiID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const emoji = await axios.patch(url, data, { headers });
      return emoji.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Delete Guild Emoji
  async deleteGuildEmoji(guildID, emojiID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/emojis/${emojiID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const emoji = await axios.delete(url, { headers });
      return emoji.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Joined Private Archived Threads
  async listJoinedPrivateArchivedThreads(channelID, data) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/users/@me/threads/archived/private`;
      let headers = { Authorization: `Bot ${this.token}` };
      const threads = await axios.get(url, data, { headers });
      return threads.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Private Archived Threads
  async listPrivateArchivedThreads(channelID, data) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/threads/archived/private`;
      let headers = { Authorization: `Bot ${this.token}` };
      const threads = await axios.get(url, data, { headers });
      return threads.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Public Archived Threads
  async listPublicArchivedThreads(channelID, data) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/threads/archived/public`;
      let headers = { Authorization: `Bot ${this.token}` };
      const threads = await axios.get(url, data, { headers });
      return threads.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Thread Members
  async listThreadMembers(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/thread-members`;
      let headers = { Authorization: `Bot ${this.token}` };
      const members = await axios.get(url, { headers });
      return members.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Get Thread Member
  async getThreadMember(channelID, userID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/thread-members/${userID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.get(url, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Remove Thread Member
  async removeThreadMember(channelID, userID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/thread-members/${userID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.delete(url, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Leave Thread
  async leaveThread(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/thread-members/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.delete(url, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Add Thread Member
  async addThreadMember(channelID, userID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/thread-members/${userID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.put(url, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Join Thread
  async joinThread(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/thread-members/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const member = await axios.put(url, { headers });
      return member.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Start Thread in Forum Channel
  async startThreadInForumChannel(channelID, data) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/threads`;
      let headers = { Authorization: `Bot ${this.token}` };
      const thread = await axios.post(url, data, { headers });
      return thread.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Start Thread without Message
  async startThreadWithoutMessage(channelID, data) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/threads`;
      let headers = { Authorization: `Bot ${this.token}` };
      const thread = await axios.post(url, data, { headers });
      return thread.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Start Thread from Message
  async startThreadFromMessage(channelID, messageID, data) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}/threads`;
      let headers = { Authorization: `Bot ${this.token}` };
      const thread = await axios.post(url, data, { headers });
      return thread.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Unpin Message
  async unpinMessage(channelID, messageID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/pins/${messageID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const message = await axios.delete(url, { headers });
      return message.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Pin Message
  async pinMessage(channelID, messageID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/pins/${messageID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const message = await axios.put(url, { headers });
      return message.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Get Pinned Messages
  async getPinnedMessages(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/pins`;
      let headers = { Authorization: `Bot ${this.token}` };
      const messages = await axios.get(url, { headers });
      return messages.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Trigger Typing Indicator
  async triggerTypingIndicator(channelID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/typing`;
      let headers = { Authorization: `Bot ${this.token}` };
      const typing = await axios.post(url, { headers });
      return typing.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Follow Announcement Channel (json params field webhook_channel_id)
  async followAnnouncementChannel(channelID, data) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/followers`;
      let headers = { Authorization: `Bot ${this.token}` };
      const follower = await axios.post(url, data, { headers });
      return follower.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Delete Channel Permission
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

  // Delete All Reactions for Emoji
  async deleteAllReactionsForEmoji(channelID, messageID, emoji) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}/reactions/${emoji}/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const reaction = await axios.delete(url, { headers });
      return reaction.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Delete All Reactions
  async deleteAllReactions(channelID, messageID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}/reactions`;
      let headers = { Authorization: `Bot ${this.token}` };
      const reaction = await axios.delete(url, { headers });
      return reaction.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Get Reactions
  async getReactions(channelID, messageID, emoji) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}/reactions/${emoji}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const reaction = await axios.get(url, { headers });
      return reaction.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Delete User Reaction
  async deleteUserReaction(channelID, messageID, emoji, userID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}/reactions/${emoji}/${userID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const reaction = await axios.delete(url, { headers });
      return reaction.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Delete Own Reaction
  async deleteOwnReaction(channelID, messageID, emoji) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}/reactions/${emoji}/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const reaction = await axios.delete(url, { headers });
      return reaction.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create Reaction
  async createReaction(channelID, messageID, emoji) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}/reactions/${emoji}/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const reaction = await axios.put(url, { headers });
      return reaction.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Crosspost Message
  async crosspostMessage(channelID, messageID) {
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}/crosspost`;
      let headers = { Authorization: `Bot ${this.token}` };
      const message = await axios.post(url, { headers });
      return message.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Auto Moderation Rules for Guild
  async listAutoModerationRulesForGuild(guildID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/auto-moderation/rules`;
      let headers = { Authorization: `Bot ${this.token}` };
      const rules = await axios.get(url, { headers });
      return rules.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Get Auto Moderation Rule
  async getAutoModerationRule(guildID, ruleID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/auto-moderation/rules/${ruleID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const rule = await axios.get(url, { headers });
      return rule.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create Auto Moderation Rule
  async createAutoModerationRule(guildID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/auto-moderation/rules`;
      let headers = { Authorization: `Bot ${this.token}` };
      const rule = await axios.post(url, data, { headers });
      return rule.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Auto Moderation Rule
  async modifyAutoModerationRule(guildID, ruleID, data) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/auto-moderation/rules/${ruleID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const rule = await axios.patch(url, data, { headers });
      return rule.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Delete Auto Moderation Rule
  async deleteAutoModerationRule(guildID, ruleID) {
    try {
      let url = `${this.baseURL}/guilds/${guildID}/auto-moderation/rules/${ruleID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const rule = await axios.delete(url, { headers });
      return rule.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create global slash commands
  async createGlobalSlashCommands(data) {
    try {
      let url = `${this.baseURL}/applications/${this.clientID}/commands`;
      let headers = { Authorization: `Bot ${this.token}` };
      const commands = await axios.post(url, data, { headers });
      return commands.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create guild slash commands
  async createGuildSlashCommands(guildID, data) {
    try {
      let url = `${this.baseURL}/applications/${this.clientID}/guilds/${guildID}/commands`;
      let headers = { Authorization: `Bot ${this.token}` };
      const commands = await axios.post(url, data, { headers });
      return commands.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create user context menu commands
  async createUserContextMenuCommands(data) {
    try {
      let url = `${this.baseURL}/applications/${this.clientID}/commands`;
      let headers = { Authorization: `Bot ${this.token}` };
      const commands = await axios.post(url, data, { headers });
      return commands.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create message context menu commands
  async createMessageContextMenuCommands(data) {
    try {
      let url = `${this.baseURL}/applications/${this.clientID}/commands`;
      let headers = { Authorization: `Bot ${this.token}` };
      const commands = await axios.post(url, data, { headers });
      return commands.data;
    } catch (err) {
      console.error(err);
    }
  }
}

// Create Modal Builder (component) (custom_id, title, addComponent, showModal) 
class ModalBuilder {
  constructor() {
    this.custom_id = null;
    this.title = null;
    this.components = [];
    this.showModal = false;
  }

  // Set Custom ID
  setCustomID(custom_id) {
    this.custom_id = custom_id;
    return this;
  }

  // Set Title
  setTitle(title) {
    this.title = title;
    return this;
  }

  // Add Component
  addComponent(component) {
    this.components.push(component);
    return this;
  }

  // Show Modal
  showModal() {
    this.showModal = true;
    return this;
  }

  // Build Modal
  build() {
    return {
      type: 9,
      custom_id: this.custom_id,
      title: this.title,
      components: this.components,
      showModal: this.showModal,
    };
  }
}

// Create TextInputBuilder (component) (custom_id, label, style, placeholder, min_length, max_length, required, disabled)
class TextInputBuilder {
  constructor() {
    this.custom_id = null;
    this.label = null;
    this.style = 1;
    this.placeholder = null;
    this.min_length = null;
    this.max_length = null;
    this.required = false;
    this.disabled = false;
  }

  // Set Custom ID
  setCustomID(custom_id) {
    this.custom_id = custom_id;
    return this;
  }

  // Set Label
  setLabel(label) {
    this.label = label;
    return this;
  }

  // Set Style (1 = Short, 2 = Long) (Default: 1)
  setStyle(style) {
    this.style = style;
    return this;
  }

  // Set Placeholder
  setPlaceholder(placeholder) {
    this.placeholder = placeholder;
    return this;
  }

  // Set Min Length
  setMinLength(min_length) {
    this.min_length = min_length;
    return this;
  }

  // Set Max Length
  setMaxLength(max_length) {
    this.max_length = max_length;
    return this;
  }

  // Set Required
  setRequired(required) {
    this.required = required;
    return this;
  }

  // Set Disabled
  setDisabled(disabled) {
    this.disabled = disabled;
    return this;
  }

  // Build TextInput
  build() {
    return {
      type: 3,
      custom_id: this.custom_id,
      label: this.label,
      style: this.style,
      placeholder: this.placeholder,
      min_length: this.min_length,
      max_length: this.max_length,
      required: this.required,
      disabled: this.disabled,
    };
  }
}

// Create Action Row Builder (component)
class ActionRowBuilder {
  constructor() {
    this.components = [];
  }

  // Add Button
  addButton(button) {
    this.components.push(button);
    return this;
  }

  // Build Action Row
  build() {
    return {
      type: 1,
      components: this.components,
    };
  }
}

// Create Button Builder (component)
class ButtonBuilder {
  constructor() {
    this.style = 1;
    this.label = null;
    this.emoji = null;
    this.custom_id = null;
    this.url = null;
    this.disabled = false;
  }

  // Set Style (1 = Primary, 2 = Secondary, 3 = Success, 4 = Danger) (Default: 1) (Required) (String) (Predefined)
  setStyle(style) {
    // Check if style is a string
    if (typeof style !== "string") {
      throw new TypeError("Style must be a string.");
    }

    // Check if style is a predefined style
    if (!["primary", "secondary", "success", "danger"].includes(style)) {
      throw new TypeError("Style must be a 'primary, secondary, success, danger'.");
    }

    // Convert style to number (1 = Primary, 2 = Secondary, 3 = Success, 4 = Danger) (Default: 1) (Switch Case)
    switch (style) {
      case "primary":
        this.style = 1;
        break;
      case "secondary":
        this.style = 2;
        break;
      case "success":
        this.style = 3;
        break;
      case "danger":
        this.style = 4;
        break;
    }

    return this.style;
  }

  // Set Label (Default: null) (Required) (String)
  setLabel(label) {
    // Check if label is a string
    if (typeof label !== "string") {
      throw new TypeError("Label must be a string.");
    }

    this.label = label;
    return this.label;
  }

  // Set Emoji (Default: null) (Optional) (Valid emoji according to Discord API) (ASCII Emoji, Unicode Emoji, Custom Emoji)
  setEmoji(emoji) {
    // Check if emoji is a string
    if (typeof emoji !== "string") {
      throw new TypeError("Emoji must be a string.");
    }

    // Check if emoji is a valid emoji
    if (!emoji.match(/^(?:[^\u0000-\u007F]|\w)*$/)) {
      throw new TypeError("Emoji must be a valid emoji.");
    }

    // Check if emoji is a custom emoji
    if (emoji.match(/<a?:\w+:\d+>/)) {
      this.emoji = {
        name: emoji.match(/<a?:\w+:\d+>/)[0],
        id: emoji.match(/<a?:\w+:(\d+)>/)[1],
      };
    } else {
      this.emoji = {
        name: emoji,
      };
    }

    return this.emoji;
  }

  // Set Custom ID (Default: null) (Required) (String)
  setCustomID(customID) {
    // Check if customID is a string
    if (typeof customID !== "string") {
      throw new TypeError("Custom ID must be a string.");
    }

    this.custom_id = customID;
    return this.custom_id;
  }

  // Set URL (Default: null) (Optional) (String)
  setURL(url) {
    // Check if url is a string
    if (typeof url !== "string") {
      throw new TypeError("URL must be a string.");
    }

    this.url = url;
    return this.url;
  }

  // Set Disabled (Default: false) (Optional) (Boolean)
  setDisabled(disabled) {
    // Check if disabled is a boolean
    if (typeof disabled !== "boolean") {
      throw new TypeError("Disabled must be a boolean.");
    }

    this.disabled = disabled;
    return this.disabled;
  }

  // Build Button
  build() {
    return {
      type: 2,
      style: this.style,
      label: this.label,
      emoji: this.emoji,
      custom_id: this.custom_id,
      url: this.url,
      disabled: this.disabled,
    };
  }
}

// Create Select Menu Builder (component)
class SelectMenuBuilder {
  constructor() {
    this.custom_id = null;
    this.placeholder = null;
    this.min_values = 1;
    this.max_values = 1;
    this.options = [];
  }

  // Set Custom ID (Default: null) (Required) (String)
  setCustomID(customID) {
    // Check if customID is a string
    if (typeof customID !== "string") {
      throw new TypeError("Custom ID must be a string.");
    }

    this.custom_id = customID;
    return this.custom_id;
  }

  // Set Placeholder (Default: null) (Optional) (String)
  setPlaceholder(placeholder) {
    // Check if placeholder is a string
    if (typeof placeholder !== "string") {
      throw new TypeError("Placeholder must be a string.");
    }

    this.placeholder = placeholder;
    return this.placeholder;
  }

  // Set Minimum Values (Default: 1) (Optional) (Number)
  setMinValues(minValues) {
    // Check if minValues is a number
    if (typeof minValues !== "number") {
      throw new TypeError("Minimum Values must be a number.");
    }

    this.min_values = minValues;
    return this.min_values;
  }

  // Set Maximum Values (Default: 1) (Optional) (Number)
  setMaxValues(maxValues) {
    // Check if maxValues is a number
    if (typeof maxValues !== "number") {
      throw new TypeError("Maximum Values must be a number.");
    }

    this.max_values = maxValues;
    return this.max_values;
  }

  // Add Option (Default: []) (Required) (Object)
  addOption(option) {
    // Check if option is an object
    if (typeof option !== "object") {
      throw new TypeError("Option must be an object.");
    }

    // Check if option is a valid option
    if (!option.label || !option.value || !option.description) {
      throw new TypeError("Option must be a valid option.");
    }

    // Add option to options array
    this.options.push(option);
    return this.options;
  }

  // Build Select Menu
  build() {
    return {
      type: 3,
      custom_id: this.custom_id,
      placeholder: this.placeholder,
      min_values: this.min_values,
      max_values: this.max_values,
      options: this.options,
    };
  }
}

module.exports = {
  SwyftDiscord,
  EmbedBuilder,
  ButtonBuilder,
  SelectMenuBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  ModalBuilder
};
