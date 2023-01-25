const WebSocket = require("ws");
const axios = require("axios");
var FormData = require("form-data");
const fs = require("fs");
const { EmbedBuilder } = require("./methods/builders/embedbuilder.js");
const { QuickDB } = require("quick.db");

class SwyftDiscord {
  // set intents and partials
  constructor(intents, partials) {
    if (!intents) return console.log("No intents provided");
    if (!partials) return console.log("No partials provided");
    if (typeof intents !== "object")
      return console.log("Intents must be an object");
    if (typeof partials !== "object")
      return console.log("Partials must be an object");
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
    this.on = this.on.bind(this);
    this.ws = new WebSocket(
      `wss://gateway.discord.gg/?v=6&encoding=json&intents=${this.intents},${this.partials}`
    );
    this.eventCallbacks = {
      messageCreate: [],
      interactionCreate: []
  }
  }

  // Login to the bot
  async login(token) {
    if (!token) return console.log("No token provided");
    if (typeof token !== "string") return console.log("Token must be a string");
    this.token = token;
    this.setClientUser(token);
  }

  // Set the bot object to the user
  async setClientUser(token) {
    if (!token) return console.log("No token provided");
    if (typeof token !== "string") return console.log("Token must be a string");
    try {
      const { data } = await axios.get(`${this.baseURL}/users/@me`, {
        headers: {
          Authorization: `Bot ${token}`,
        },
      });
      this.user = data;
    } catch (error) {
      console.error(error);
    }
  }

  async on(eventType, callback) {
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
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (eventType === "messageCreate" && message.t === "MESSAGE_CREATE") {
        message.d.channel = { id: message.d.channel_id };
        message.d.guild = { id: message.d.guild_id };
        delete message.d.guild_id;
        delete message.d.channel_id;
        this.currentChannelID = message.d.channel.id;
        this.currentGuildID = message.d.guild.id;
        callback(message.d);
      } else if (message.op === 10) {
        this.startHeartbeat(message.d.heartbeat_interval);
      }
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (eventType === "interactionCreate" && message.t === "INTERACTION_CREATE") {
        message.d.channel = { id: message.d.channel_id };
        message.d.command = { id: message.d.data.id, name: message.d.data.name, type: message.d.data.type };
        delete message.d.channel_id;
        delete message.d.data;
        this.currentChannelID = message.d.channel_id;
        this.currentGuildID = message.d.guild_id;
        callback(message.d);
      } else if (message.op === 10) {
        this.startHeartbeat(message.d.heartbeat_interval);
      }
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (eventType === "messageUpdate" && message.t === "MESSAGE_UPDATE") {
        message.d.channel_id = message.d.channel_id;
        this.currentChannelID = message.d.channel_id;
        this.currentGuildID = message.d.guild_id;
        callback(message.d);
      } else if (message.op === 10) {
        this.startHeartbeat(message.d.heartbeat_interval);
      }
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (eventType === "messageDelete" && message.t === "MESSAGE_DELETE") {
        message.d.channel_id = message.d.channel_id;
        this.currentChannelID = message.d.channel_id;
        this.currentGuildID = message.d.guild_id;
        callback(message.d);
      } else if (message.op === 10) {
        this.startHeartbeat(message.d.heartbeat_interval);
      }
    });

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
  async setActivity(status = null, type = null, activity = null) {
    if (typeof status !== "string") console.log("Status must be a string");
    if (typeof type !== "string") console.log("Type must be a string");
    if (typeof activity !== "string") console.log("Activity must be a string");
    if (status === null) status = "online";
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
    if (!channelID) console.log("Channel ID is required.");
    if (!amount) console.log("Amount is required.");
    if (amount > 100) console.log("Amount must be less than 100.");
    if (amount < 1) console.log("Amount must be greater than 0.");
    if (typeof amount !== "number") console.log("Amount must be a number.");
    if (typeof channelID !== "string")
      console.log("Channel ID must be a string.");
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
    if (!channelID) console.log("Channel ID is required.");
    if (message) {
      if (typeof message !== "string" && typeof message !== "object")
        console.log("Message must be a string or object.");
    }
    if (options) {
      if (!options.embeds && !options.attachments)
        console.log("Invalid options. (embeds or attachments)");
      if (options.embeds && !Array.isArray(options.embeds))
        console.log("Embeds must be an array.");
      if (options.attachments && !Array.isArray(options.attachments))
        console.log("Attachments must be an array.");
    }
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
        if (options.components) {
          data.components = options.components;
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
    if (!channelID) console.log("channelID is required");
    if (!messageID) console.log("messageID is required");
    if (!newMessage) console.log("newMessage is required");
    if (typeof channelID !== "string")
      console.log("channelID must be a string");
    if (typeof messageID !== "string")
      console.log("messageID must be a string");
    if (typeof newMessage !== "string")
      console.log("newMessage must be a string");
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
      console.log("channelID is required");
    }
    if (!amount) {
      console.log("amount is required");
    }
    if (amount < 0) {
      console.log("amount cannot be negative");
    }
    if (amount > 100) {
      console.log("amount cannot be greater than 100");
    }
    if (typeof channelID !== "string")
      console.log("channelID must be a string");
    if (typeof amount !== "number") console.log("amount must be a number");
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
    if (!user) return console.log("You must provide a user object.");
    if (typeof user !== "object") return console.log("User must be an object.");
    if (user.id && user.avatar) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    } else {
      console.log("User does not have an avatar or is not a valid user");
    }
  }

  // Get a user
  async getUser(userID) {
    if (!userID) return console.log("You must provide a user ID.");
    if (typeof userID !== "string")
      return console.log("User ID must be a string.");
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
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (!message.mentions) return console.log("Message must have mentions.");
    if (message.mentions.length < 1)
      return console.log("Message must have at least one mention.");
    let mentionedUsers = [];
    for (let i = 0; i < message.mentions.length; i++) {
      let user = await this.getUser(message.mentions[i].id);
      mentionedUsers.push(user);
    }
    return mentionedUsers;
  }

  // get first mentioned user
  async getFirstMentionedUser(message) {
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (!message.mentions) return console.log("Message must have mentions.");
    if (message.mentions.length < 1)
      return console.log("Message must have at least one mention.");
    let mentionedUsers = await this.getMentionedUsers(message);
    return mentionedUsers[0];
  }

  // get last mentioned user
  async getLastMentionedUser(message) {
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (!message.mentions) return console.log("Message must have mentions.");
    if (message.mentions.length < 1)
      return console.log("Message must have at least one mention.");
    let mentionedUsers = await this.getMentionedUsers(message);
    return mentionedUsers[mentionedUsers.length - 1];
  }

  // get a member
  async getMember(userID) {
    if (!userID) return console.log("You must provide a user ID.");
    if (typeof userID !== "string")
      return console.log("User ID must be a string.");
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
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (!message.mentions) return console.log("Message must have mentions.");
    if (message.mentions.length < 1)
      return console.log("Message must have at least one mention.");
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
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (!message.mentions) return console.log("Message must have mentions.");
    if (message.mentions.length < 1)
      return console.log("Message must have at least one mention.");
    let mentionedMembers = await this.getMentionedMembers(message);
    return mentionedMembers[0];
  }

  // get last mentioned member
  async getLastMentionedMember(message) {
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (!message.mentions) return console.log("Message must have mentions.");
    if (message.mentions.length < 1)
      return console.log("Message must have at least one mention.");
    let mentionedMembers = await this.getMentionedMembers(message);
    return mentionedMembers[mentionedMembers.length - 1];
  }

  // get a guild id
  async getGuildID(channelID) {
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!guildID) return console.log("You must provide a guild ID.");
    if (typeof guildID !== "string")
      return console.log("Guild ID must be a string.");
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
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
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
    if (!channelID) return console.log("You must provide a channel ID.");
    if (!amount) return console.log("You must provide an amount.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
    if (typeof amount !== "number")
      return console.log("Amount must be a number.");
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
    if (!channelID) return console.log("You must provide a channel ID.");
    if (!messageID) return console.log("You must provide a message ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
    if (typeof messageID !== "string")
      return console.log("Message ID must be a string.");
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
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (!message.content) return console.log("Message must have a content.");
    if (typeof message.content !== "string")
      return console.log("Message content must be a string.");
    if (!message.content.match(/<#(\d+)>/g))
      return console.log("Message must have a channel mention.");
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
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (!message.content) return console.log("Message must have a content.");
    if (typeof message.content !== "string")
      return console.log("Message content must be a string.");
    if (!message.content.match(/<#(\d+)>/g))
      return console.log("Message must have a channel mention.");
    const channelIDs = message.content.match(/<#(\d+)>/g);
    if (!channelIDs) return [];
    const id = channelIDs[0].match(/\d+/)[0];
    const channel = await this.getChannel(id);
    return channel;
  }

  // get last mentioned channel
  async getLastMentionedChannel(message) {
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (!message.content) return console.log("Message must have a content.");
    if (typeof message.content !== "string")
      return console.log("Message content must be a string.");
    if (!message.content.match(/<#(\d+)>/g))
      return console.log("Message must have a channel mention.");
    const channelIDs = message.content.match(/<#(\d+)>/g);
    if (!channelIDs) return [];
    const id = channelIDs[channelIDs.length - 1].match(/\d+/)[0];
    const channel = await this.getChannel(id);
    return channel;
  }

  // create channel
  async createChannel(
    name,
    type,
    position = null,
    topic = null,
    nsfw = null,
    bitrate = null,
    userLimit = null,
    rateLimitPerUser = null,
    permissionOverwrites = null,
    parentID = null,
    rtcRegion = null,
    videoQualityMode = null
  ) {
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
    if (!name) return console.log("You must provide a name.");
    if (typeof name !== "string") return console.log("Name must be a string.");
    if (!type) return console.log("You must provide a type.");
    if (typeof type !== "number") return console.log("Type must be a number.");
    if (position && typeof position !== "number")
      return console.log("Position must be a number.");
    if (topic && typeof topic !== "string")
      return console.log("Topic must be a string.");
    if (nsfw && typeof nsfw !== "boolean")
      return console.log("NSFW must be a boolean.");
    if (bitrate && typeof bitrate !== "number")
      return console.log("Bitrate must be a number.");
    if (userLimit && typeof userLimit !== "number")
      return console.log("User limit must be a number.");
    if (rateLimitPerUser && typeof rateLimitPerUser !== "number")
      return console.log("Rate limit per user must be a number.");
    if (permissionOverwrites && typeof permissionOverwrites !== "object")
      return console.log("Permission overwrites must be an object.");
    if (parentID && typeof parentID !== "string")
      return console.log("Parent ID must be a string.");
    if (rtcRegion && typeof rtcRegion !== "string")
      return console.log("RTC region must be a string.");
    if (videoQualityMode && typeof videoQualityMode !== "number")
      return console.log("Video quality mode must be a number.");
    let data = {
      name: name,
      type: type,
    };
    if (position) data.position = position;
    if (topic) data.topic = topic;
    if (nsfw) data.nsfw = nsfw;
    if (bitrate) data.bitrate = bitrate;
    if (userLimit) data.user_limit = userLimit;
    if (rateLimitPerUser) data.rate_limit_per_user = rateLimitPerUser;
    if (permissionOverwrites) data.permission_overwrites = permissionOverwrites;
    if (parentID) data.parent_id = parentID;
    if (rtcRegion) data.rtc_region = rtcRegion;
    if (videoQualityMode) data.video_quality_mode = videoQualityMode;
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
  async editChannel(
    channelID,
    name,
    type,
    position = null,
    topic = null,
    nsfw = null,
    bitrate = null,
    userLimit = null,
    rateLimitPerUser = null,
    permissionOverwrites = null,
    parentID = null,
    rtcRegion = null,
    videoQualityMode = null
  ) {
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
    if (!name) return console.log("You must provide a name.");
    if (typeof name !== "string") return console.log("Name must be a string.");
    if (!type) return console.log("You must provide a type.");
    if (typeof type !== "number") return console.log("Type must be a number.");
    if (position && typeof position !== "number")
      return console.log("Position must be a number.");
    if (topic && typeof topic !== "string")
      return console.log("Topic must be a string.");
    if (nsfw && typeof nsfw !== "boolean")
      return console.log("NSFW must be a boolean.");
    if (bitrate && typeof bitrate !== "number")
      return console.log("Bitrate must be a number.");
    if (userLimit && typeof userLimit !== "number")
      return console.log("User limit must be a number.");
    if (rateLimitPerUser && typeof rateLimitPerUser !== "number")
      return console.log("Rate limit per user must be a number.");
    if (permissionOverwrites && typeof permissionOverwrites !== "object")
      return console.log("Permission overwrites must be an object.");
    if (parentID && typeof parentID !== "string")
      return console.log("Parent ID must be a string.");
    if (rtcRegion && typeof rtcRegion !== "string")
      return console.log("RTC region must be a string.");
    if (videoQualityMode && typeof videoQualityMode !== "number")
      return console.log("Video quality mode must be a number.");
    let data = {
      name: name,
      type: type,
    };
    if (position) data.position = position;
    if (topic) data.topic = topic;
    if (nsfw) data.nsfw = nsfw;
    if (bitrate) data.bitrate = bitrate;
    if (userLimit) data.user_limit = userLimit;
    if (rateLimitPerUser) data.rate_limit_per_user = rateLimitPerUser;
    if (permissionOverwrites) data.permission_overwrites = permissionOverwrites;
    if (parentID) data.parent_id = parentID;
    if (rtcRegion) data.rtc_region = rtcRegion;
    if (videoQualityMode) data.video_quality_mode = videoQualityMode;
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
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
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
  async setChannelPermissions(channelID, overwriteID, allow, deny, type) {
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
    if (!overwriteID) return console.log("You must provide an overwrite ID.");
    if (typeof overwriteID !== "string")
      return console.log("Overwrite ID must be a string.");
    if (!allow) return console.log("You must provide an allow value.");
    if (typeof allow !== "number")
      return console.log("Allow value must be a number.");
    if (!deny) return console.log("You must provide a deny value.");
    if (typeof deny !== "number")
      return console.log("Deny value must be a number.");
    if (!type) return console.log("You must provide a type.");
    if (typeof type !== "number") return console.log("Type must be a number.");
    if (type !== 0 && type !== 1)
      return console.log("Type must be 0 or 1. 0 is role, 1 is member.");
    const data = {
      allow: allow,
      deny: deny,
      type: type,
    };
    try {
      let url = `${this.baseURL}/channels/${channelID}/permissions/${overwriteID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const permissions = await axios.put(url, data, { headers });
      return permissions.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get channel permissions
  async getChannelPermissions(channelID) {
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
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
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
    if (!position) return console.log("You must provide a position.");
    if (typeof position !== "number")
      return console.log("Position must be a number.");
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
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
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
  async createChannelInvite(
    channelID,
    {
      max_age,
      max_uses,
      temporary,
      unique,
      target_type = null,
      target_user_id = null,
      target_application_id = null,
    }
  ) {
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
    if (!max_age) max_age = 86400;
    if (!max_uses) max_uses = 0;
    if (!temporary) temporary = false;
    if (!unique) unique = false;
    let data = { max_age, max_uses, temporary, unique };
    if (target_type && target_type !== 1 && target_type !== 2)
      return console.log("Target type must be 1 or 2.");
    if (target_type && !target_user_id && !target_application_id)
      return console.log(
        "You must provide a target user ID or target application ID."
      );
    if (target_type && target_user_id && target_application_id)
      return console.log(
        "You must provide a target user ID or target application ID, not both."
      );
    if (target_type && target_user_id && typeof target_user_id !== "string")
      return console.log("Target user ID must be a string.");
    if (
      target_type &&
      target_application_id &&
      typeof target_application_id !== "string"
    )
      return console.log("Target application ID must be a string.");
    if (target_type) data.target_type = target_type;
    if (target_type == 1) data.target_user_id = target_user_id;
    if (target_type == 2) data.target_application_id = target_application_id;
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
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
    if (!overwriteID) return console.log("You must provide an overwrite ID.");
    if (typeof overwriteID !== "string")
      return console.log("Overwrite ID must be a string.");
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
    if (!channelID) return console.log("You must provide a channel ID.");
    if (typeof channelID !== "string")
      return console.log("Channel ID must be a string.");
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
    if (!emojiID) return console.log("You must provide an emoji ID.");
    if (typeof emojiID !== "string")
      return console.log("Emoji ID must be a string.");
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
    if (!roleID) return console.log("You must provide a role ID.");
    if (typeof roleID !== "string")
      return console.log("Role ID must be a string.");
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
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (message.mention_roles.length === 0)
      return console.log("No roles were mentioned.");
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
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (message.mention_roles.length === 0)
      return console.log("No roles were mentioned.");
    const roles = message.mention_roles;
    const role = await this.getRole(roles[0]);
    return role;
  }

  // get last mentioned role
  async getLastMentionedRole(message) {
    if (!message) return console.log("You must provide a message.");
    if (typeof message !== "object")
      return console.log("Message must be an object.");
    if (message.mention_roles.length === 0)
      return console.log("No roles were mentioned.");
    const roles = message.mention_roles;
    const role = await this.getRole(roles[roles.length - 1]);
    return role;
  }

  // create role
  async createRole({
    name,
    permissions,
    color,
    hoist,
    icon,
    unicodeEmoji,
    mentionable,
  }) {
    if (
      !name &&
      !permissions &&
      !color &&
      !hoist &&
      !icon &&
      !unicodeEmoji &&
      !mentionable
    )
      return console.log(
        "You must provide a name, permissions, color, hoist, icon, unicode emoji, or mentionable."
      );
    if (permissions && typeof permissions !== "string")
      return console.log("Permissions must be a string.");
    if (color && typeof color !== "number")
      return console.log("Color must be a number.");
    if (hoist && typeof hoist !== "boolean")
      return console.log("Hoist must be a boolean.");
    if (mentionable && typeof mentionable !== "boolean")
      return console.log("Mentionable must be a boolean.");
    let data = {};
    if (name) data.name = name;
    if (permissions) data.permissions = permissions;
    if (color) data.color = color;
    if (hoist) data.hoist = hoist;
    if (icon) data.icon = icon;
    if (unicodeEmoji) data.unicode_emoji = unicodeEmoji;
    if (mentionable) data.mentionable = mentionable;
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
  async editRole(
    roleID,
    { name, permissions, color, hoist, icon, unicodeEmoji, mentionable }
  ) {
    if (!roleID) return console.log("You must provide a role ID.");
    if (
      !name &&
      !permissions &&
      !color &&
      !hoist &&
      !icon &&
      !unicodeEmoji &&
      !mentionable
    )
      return console.log(
        "You must provide a name, permissions, color, hoist, icon, unicode emoji, or mentionable."
      );
    if (permissions && typeof permissions !== "string")
      return console.log("Permissions must be a string.");
    if (color && typeof color !== "number")
      return console.log("Color must be a number.");
    if (hoist && typeof hoist !== "boolean")
      return console.log("Hoist must be a boolean.");
    if (mentionable && typeof mentionable !== "boolean")
      return console.log("Mentionable must be a boolean.");
    let data = {};
    if (name) data.name = name;
    if (permissions) data.permissions = permissions;
    if (color) data.color = color;
    if (hoist) data.hoist = hoist;
    if (icon) data.icon = icon;
    if (unicodeEmoji) data.unicode_emoji = unicodeEmoji;
    if (mentionable) data.mentionable = mentionable;
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
    if (!roleID) return console.log("You must provide a role ID.");
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
    if (!memberID) return console.log("You must provide a member ID.");
    if (typeof memberID !== "string")
      return console.log("Member ID must be a string.");
    if (!roleID) return console.log("You must provide a role ID.");
    if (typeof roleID !== "string")
      return console.log("Role ID must be a string.");
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
    if (!memberID) return console.log("You must provide a member ID.");
    if (typeof memberID !== "string")
      return console.log("Member ID must be a string.");
    if (!roleID) return console.log("You must provide a role ID.");
    if (typeof roleID !== "string")
      return console.log("Role ID must be a string.");
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
    if (!memberID) return console.log("You must provide a member ID.");
    if (typeof memberID !== "string")
      return console.log("Member ID must be a string.");
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
  async banMember(memberID, seconds) {
    if (!memberID) return console.log("You must provide a member ID.");
    if (typeof memberID !== "string")
      return console.log("Member ID must be a string.");
    if (seconds && typeof seconds !== "number") {
      return console.log("Seconds must be a number.");
    }
    let data = {};
    if (seconds) {
      data.delete_message_days = seconds;
    }
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
    if (!memberID) return console.log("You must provide a member ID.");
    if (typeof memberID !== "string")
      return console.log("Member ID must be a string.");
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
  async modifyCurrentUser(username, avatar = null) {
    if (!username) return console.log("You must provide a username.");
    if (typeof username !== "string")
      return console.log("Username must be a string.");
    if (avatar && typeof avatar !== "string")
      return console.log("Avatar must be a string.");
    if (
      avatar &&
      (!avatar.startsWith("http://") || !avatar.startsWith("https://"))
    )
      return console.log("Avatar must be a URL.");
    const data = {
      username: username,
      avatar: avatar,
    };
    try {
      let url = `${this.baseURL}/users/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const user = await axios.patch(url, data, { headers });
      return user.data;
    } catch (err) {
      if (err.response.status == 429) {
        let minutes = Math.floor(err.response.data.retry_after / 60);
        let seconds = err.response.data.retry_after - minutes * 60;
        return console.error(
          `You are being rate limited! Try again in ${minutes} minutes and ${seconds.toFixed(
            0
          )} seconds.`
        );
      }
      console.error(err);
    }
  }

  // send a message to a user via DM (requires user ID and message content)
  async sendDM(userID, content, options) {
    if (!userID) return console.log("You must provide a user ID.");
    if (!content) return console.log("You must provide a message.");
    if (typeof userID !== "string")
      return console.log("User ID must be a string.");
    if (typeof content !== "string")
      return console.log("Message must be a string.");
    try {
      const formData = new FormData();
      let user = await this.getUser(userID);
      let mention = `[object Object]`;
      let contents = content;
      if (content.includes(mention)) {
        contents = content.replace(mention, `<@${user.id}>`);
      }
      let url = `${this.baseURL}/users/@me/channels`;
      let headers = { Authorization: `Bot ${this.token}` };
      const data = { recipient_id: userID };
      const channel = await axios.post(url, data, { headers });
      if (options) {
        if (options.embeds) {
          formData.append(
            "payload_json",
            JSON.stringify({
              content: contents,
              embeds: options.embeds.map((embed) => embed.embed),
            })
          );
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
      } else {
        formData.append("payload_json", JSON.stringify({ content: contents }));
      }
      const send = await axios.post(
        `${this.baseURL}/channels/${channel.data.id}/messages`,
        formData,
        {
          headers: {
            ...headers,
            "Content-Type": "multipart/form-data",
          },
        }
      );
      return send.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get sticker
  async getSticker(stickerID) {
    if (!stickerID) return console.log("You must provide a sticker ID.");
    if (typeof stickerID !== "string")
      return console.log("Sticker ID must be a string.");
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
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
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
    if (!guildID) throw new Error("Guild ID is required.");
    if (!stickerID) throw new Error("Sticker ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (typeof stickerID !== "string")
      throw new Error("Sticker ID must be a string.");
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
  async createGuildSticker(guildID, name, description, tags, file) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (!name) throw new Error("Sticker name is required.");
    if (!description) throw new Error("Sticker description is required.");
    if (!tags) throw new Error("Sticker tags are required.");
    if (!file) throw new Error("Sticker file is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (typeof name !== "string")
      throw new Error("Sticker name must be a string.");
    if (typeof description !== "string")
      throw new Error("Sticker description must be a string.");
    if (typeof tags !== "string")
      throw new Error("Sticker tags must be a string.");
    if (typeof file !== "string")
      throw new Error("Sticker file must be a string.");
    const data = {
      name: name,
      description: description,
      tags: tags,
      file: file,
    };
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
  async modifyGuildSticker(guildID, stickerID, { name, description, tags }) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (!stickerID) throw new Error("Sticker ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (typeof stickerID !== "string")
      throw new Error("Sticker ID must be a string.");
    if (!name) throw new Error("Sticker name is required.");
    if (typeof name !== "string")
      throw new Error("Sticker name must be a string.");
    if (!description) throw new Error("Sticker description is required.");
    if (typeof description !== "string")
      throw new Error("Sticker description must be a string.");
    if (!tags) throw new Error("Sticker tags are required.");
    if (typeof tags !== "string")
      throw new Error("Sticker tags must be a string.");
    const data = {
      name: name,
      description: description,
      tags: tags,
    };
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
    if (!guildID) throw new Error("Guild ID is required.");
    if (!stickerID) throw new Error("Sticker ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (typeof stickerID !== "string")
      throw new Error("Sticker ID must be a string.");
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
  async modifyUserVoiceState(guildID, userID, channelID, suppress = null) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (!userID) throw new Error("User ID is required.");
    if (!channelID) throw new Error("Channel ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (typeof userID !== "string")
      throw new Error("User ID must be a string.");
    if (typeof channelID !== "string")
      throw new Error("Channel ID must be a string.");
    const data = {
      channel_id: channelID,
      suppress: suppress,
    };
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
  async modifyCurrentUserVoiceState(
    guildID,
    channelID,
    suppress = null,
    requestToSpeakTimestamp = null
  ) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (!channelID) throw new Error("Channel ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (typeof channelID !== "string")
      throw new Error("Channel ID must be a string.");
    if (suppress !== null && typeof suppress !== "boolean")
      throw new Error("Suppress must be a boolean.");
    if (
      requestToSpeakTimestamp !== null &&
      typeof requestToSpeakTimestamp !== "number"
    )
      throw new Error("Request to speak timestamp must be a number.");
    const data = {
      channel_id: channelID,
      suppress: suppress,
      request_to_speak_timestamp: requestToSpeakTimestamp,
    };
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
  async modifyGuildWelcomeScreen(
    guildID,
    enabled,
    welcomeChannels,
    description
  ) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (!enabled) throw new Error("Enabled is required.");
    if (typeof enabled !== "boolean")
      throw new Error("Enabled must be a boolean.");
    if (!welcomeChannels) throw new Error("Welcome Channels is required.");
    if (!Array.isArray(welcomeChannels))
      throw new Error("Welcome Channels must be an array.");
    if (!description) throw new Error("Description is required.");
    if (typeof description !== "string")
      throw new Error("Description must be a string.");
    const data = {
      enabled: enabled,
      welcome_channels: welcomeChannels,
      description: description,
    };
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
  async modifyGuildWidget(
    guildID,
    { id, name, instantInvite, channels, members, presenceCount }
  ) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (!id) throw new Error("ID is required.");
    if (typeof id !== "string") throw new Error("ID must be a string.");
    if (!name) throw new Error("Name is required.");
    if (typeof name !== "string") throw new Error("Name must be a string.");
    if (!instantInvite) throw new Error("Instant Invite is required.");
    if (typeof instantInvite !== "string")
      throw new Error("Instant Invite must be a string.");
    if (!channels) throw new Error("Channels is required.");
    if (typeof channels === "string")
      throw new Error("Channels must be array.");
    if (!members) throw new Error("Members is required.");
    if (typeof members === "string") throw new Error("Members must be array.");
    if (!presenceCount) throw new Error("Presence Count is required.");
    if (typeof presenceCount === "string")
      throw new Error("Presence Count must be a number.");
    const data = {
      id: id,
      name: name,
      instant_invite: instantInvite,
      channels: channels,
      members: members,
      presence_count: presenceCount,
    };
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
  async guildPrune(guildID, days, computePruneCount, includeRoles, reason) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (!days) throw new Error("Days is required.");
    if (typeof days !== "number") throw new Error("Days must be a number.");
    if (!computePruneCount) throw new Error("Compute Prune Count is required.");
    if (typeof computePruneCount !== "boolean")
      throw new Error("Compute Prune Count must be a boolean.");
    if (!includeRoles) throw new Error("Include Roles is required.");
    if (typeof includeRoles !== "array")
      throw new Error("Include Roles must be array of snowflakes.");
    if (!reason) throw new Error("Reason is required.");
    if (typeof reason !== "string") throw new Error("Reason must be a string.");
    const data = {
      days: days,
      compute_prune_count: computePruneCount,
      include_roles: includeRoles,
      reason: reason,
    };
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
  async modifyGuildMFALevel(guildID, level) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (!level) throw new Error("MFA Level is required.");
    if (typeof level !== "number")
      throw new Error("MFA Level must be a number.");
    try {
      let url = `${this.baseURL}/guilds/${guildID}/mfa`;
      let headers = { Authorization: `Bot ${this.token}` };
      const mfaLevel = await axios.patch(url, level, { headers });
      return mfaLevel.level;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild Role Positions
  async modifyGuildRolePositions(guildID, id, position) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (!id) throw new Error("Role ID is required.");
    if (typeof id !== "string") throw new Error("Role ID must be a string.");
    if (!position) throw new Error("Position is required.");
    if (typeof position !== "number")
      throw new Error("Position must be a number.");
    const data = {
      id: id,
      position: position,
    };
    try {
      let url = `${this.baseURL}/guilds/${guildID}/roles`;
      let headers = { Authorization: `Bot ${this.token}` };
      const rolePositions = await axios.patch(url, data, { headers });
      return rolePositions.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Current Member Nick
  async modifyCurrentMemberNick(guildID, nick) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (typeof nick !== "string") throw new Error("Nick must be a string.");
    try {
      let url = `${this.baseURL}/guilds/${guildID}/members/@me`;
      let headers = { Authorization: `Bot ${this.token}` };
      const tnick = await axios.patch(url, nick, { headers });
      return tnick.nick;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild Member
  async modifyGuildMember(
    guildID,
    userID,
    {
      nick = null,
      roles = null,
      mute = null,
      deaf = null,
      channelID = null,
      communicationDisabledUntil = null,
    }
  ) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (!userID) throw new Error("User ID is required.");
    if (typeof userID !== "string")
      throw new Error("User ID must be a string.");
    if (typeof nick !== "string") throw new Error("Nick must be a string.");
    if (!Array.isArray(roles)) throw new Error("Roles must be an array.");
    if (typeof mute !== "boolean") throw new Error("Mute must be a boolean.");
    if (typeof deaf !== "boolean") throw new Error("Deaf must be a boolean.");
    if (typeof channelID !== "string")
      throw new Error("Channel ID must be a string.");
    if (typeof communicationDisabledUntil !== "string")
      throw new Error("Communication Disabled Until must be a string.");
    let data = {};
    if (nick) data.nick = nick;
    if (roles) data.roles = roles;
    if (mute) data.mute = mute;
    if (deaf) data.deaf = deaf;
    if (channelID) data.channel_id = channelID;
    if (communicationDisabledUntil)
      data.communication_disabled_until = communicationDisabledUntil;
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
  async searchGuildMembers(guildID, query, limit = null) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (typeof query !== "string") throw new Error("Query must be a string.");
    if (typeof limit !== "number") throw new Error("Limit must be a number.");
    try {
      let url = `${this.baseURL}/guilds/${guildID}/members/search?query=${query}?limit=${limit}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const members = await axios.get(url, { headers });
      return members.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Guild Members
  async listGuildMembers(guildID, limit = null, after = null) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    if (typeof limit !== "number") throw new Error("Limit must be a number.");
    if (typeof after !== "string") throw new Error("After must be a string.");
    try {
      let url = `${this.baseURL}/guilds/${guildID}/members?limit=${limit}&after=${after}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const members = await axios.get(url, { headers });
      return members.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Active Guild Threads
  async listActiveGuildThreads(guildID) {
    if (!guildID) throw new Error("Guild ID is required.");
    if (typeof guildID !== "string")
      throw new Error("Guild ID must be a string.");
    try {
      let url = `${this.baseURL}/guilds/${guildID}/threads/active`;
      let headers = { Authorization: `Bot ${this.token}` };
      const threads = await axios.get(url, { headers });
      return threads.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Modify Guild Channel Positions
  async modifyGuildChannelPositions(
    guildID,
    channelID,
    position,
    lockPermissions,
    parentID
  ) {
    if (!channelID) throw new Error("Channel ID is required.");
    if (!position) throw new Error("Position is required.");
    if (!lockPermissions) throw new Error("Lock Permissions is required.");
    if (!parentID) throw new Error("Parent ID is required.");
    if (typeof channelID !== "string")
      throw new Error("Channel ID must be a string.");
    if (typeof position !== "number")
      throw new Error("Position must be a number.");
    if (typeof lockPermissions !== "boolean")
      throw new Error("Lock Permissions must be a boolean.");
    if (typeof parentID !== "string")
      throw new Error("Parent ID must be a string.");
    let data = {
      id: channelID,
      position: position,
      lock_permissions: lockPermissions,
      parent_id: parentID,
    };
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
  async modifyGuild(
    guildID,
    {
      name,
      afkTimeout,
      ownerID,
      systemChannelFlags,
      features,
      premiumProgressBarEnabled,
      verificationLevel = null,
      defaultMessageNotifications = null,
      explicitContentFilter = null,
      afkChannelId = null,
      icon = null,
      splash = null,
      discoverySplash = null,
      banner = null,
      systemChannelId = null,
      rulesChannelId = null,
      publicUpdatesChannelId = null,
      preferredLocale = null,
      description = null,
    }
  ) {
    let data = {};
    if (name) data.name = name;
    if (afkTimeout) data.afk_timeout = afkTimeout;
    if (ownerID) data.owner_id = ownerID;
    if (systemChannelFlags) data.system_channel_flags = systemChannelFlags;
    if (features) data.features = features;
    if (premiumProgressBarEnabled)
      data.premium_progress_bar_enabled = premiumProgressBarEnabled;
    if (verificationLevel) data.verification_level = verificationLevel;
    if (defaultMessageNotifications)
      data.default_message_notifications = defaultMessageNotifications;
    if (explicitContentFilter)
      data.explicit_content_filter = explicitContentFilter;
    if (afkChannelId) data.afk_channel_id = afkChannelId;
    if (icon) data.icon = icon;
    if (splash) data.splash = splash;
    if (discoverySplash) data.discovery_splash = discoverySplash;
    if (banner) data.banner = banner;
    if (systemChannelId) data.system_channel_id = systemChannelId;
    if (rulesChannelId) data.rules_channel_id = rulesChannelId;
    if (publicUpdatesChannelId)
      data.public_updates_channel_id = publicUpdatesChannelId;
    if (preferredLocale) data.preferred_locale = preferredLocale;
    if (description) data.description = description;
    if (!guildID) console.log("No guild ID provided.");
    if (typeof guildID === "string") console.log("Guild ID must be a number.");
    if (!data) console.log("No data provided.");
    if (typeof data !== "object") console.log("Data must be an object.");
    if (typeof data.name !== "string") console.log("Name must be a string.");
    if (typeof data.afk_timeout !== "number")
      console.log("AFK Timeout must be a number.");
    if (typeof data.owner_id !== "string")
      console.log("Owner ID must be a string.");
    if (typeof data.system_channel_flags !== "number")
      console.log("System Channel Flags must be a number.");
    if (typeof data.features !== "object")
      console.log("Features must be an array.");
    if (typeof data.premium_progress_bar_enabled !== "boolean")
      console.log("Premium Progress Bar Enabled must be a boolean.");
    if (data.verification_level && typeof data.verification_level !== "number")
      console.log("Verification Level must be a number.");
    if (
      data.default_message_notifications &&
      typeof data.default_message_notifications !== "number"
    )
      console.log("Default Message Notifications must be a number.");
    if (
      data.explicit_content_filter &&
      typeof data.explicit_content_filter !== "number"
    )
      console.log("Explicit Content Filter must be a number.");
    if (data.afk_channel_id && typeof data.afk_channel_id !== "string")
      console.log("AFK Channel ID must be a string.");
    if (data.icon && typeof data.icon !== "string")
      console.log("Icon must be a string.");
    if (data.splash && typeof data.splash !== "string")
      console.log("Splash must be a string.");
    if (data.discovery_splash && typeof data.discovery_splash !== "string")
      console.log("Discovery Splash must be a string.");
    if (data.banner && typeof data.banner !== "string")
      console.log("Banner must be a string.");
    if (data.system_channel_id && typeof data.system_channel_id !== "string")
      console.log("System Channel ID must be a string.");
    if (data.rules_channel_id && typeof data.rules_channel_id !== "string")
      console.log("Rules Channel ID must be a string.");
    if (
      data.public_updates_channel_id &&
      typeof data.public_updates_channel_id !== "string"
    )
      console.log("Public Updates Channel ID must be a string.");
    if (data.preferred_locale && typeof data.preferred_locale !== "string")
      console.log("Preferred Locale must be a string.");
    if (data.description && typeof data.description !== "string")
      console.log("Description must be a string.");
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
    if (!guildID) console.log("No guild ID provided.");
    if (typeof guildID === "string") console.log("Guild ID must be a number.");
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
    if (!guildID) console.log("No guild ID provided.");
    if (typeof guildID === "string") console.log("Guild ID must be a number.");
    if (!emojiID) console.log("No emoji ID provided.");
    if (typeof emojiID === "string") console.log("Emoji ID must be a number.");
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
  async createGuildEmoji(guildID, name, image, roles) {
    if (!guildID) console.log("No guild ID provided.");
    if (typeof guildID === "string") console.log("Guild ID must be a number.");
    if (!name) console.log("No name provided.");
    if (typeof name === "string") console.log("Name must be a string.");
    if (!image) console.log("No image provided.");
    if (typeof image === "string") console.log("Image must be a string.");
    if (!roles) console.log("No roles provided.");
    if (typeof roles === "string") console.log("Roles must be an array.");
    let data = { name, image, roles };
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
  async modifyGuildEmoji(guildID, emojiID, name, roles) {
    if (!guildID) console.log("No guild ID provided.");
    if (typeof guildID === "string") console.log("Guild ID must be a number.");
    if (!emojiID) console.log("No emoji ID provided.");
    if (typeof emojiID === "string") console.log("Emoji ID must be a number.");
    if (!name) console.log("No name provided.");
    if (typeof name === "string") console.log("Name must be a string.");
    if (!roles) console.log("No roles provided.");
    if (typeof roles === "string") console.log("Roles must be an array.");
    const data = { name, roles };
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
    if (!guildID) console.log("No guild ID provided.");
    if (typeof guildID === "string") console.log("Guild ID must be a number.");
    if (!emojiID) console.log("No emoji ID provided.");
    if (typeof emojiID === "string") console.log("Emoji ID must be a number.");
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
  async listJoinedPrivateArchivedThreads(channelID, before, limit) {
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!before) console.log("No before provided.");
    if (typeof before === "string")
      console.log("Before must be a number. ISO8601 timestamp.");
    if (!limit) console.log("No limit provided.");
    if (typeof limit === "string") console.log("Limit must be a number.");
    const data = {
      before: before,
      limit: limit,
    };
    try {
      let url = `${this.baseURL}/channels/${channelID}/users/@me/threads/archived/private?before=${data.before}&limit=${data.limit}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const threads = await axios.get(url, data, { headers });
      return threads.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Private Archived Threads
  async listPrivateArchivedThreads(channelID, before, limit) {
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!before) console.log("No before provided.");
    if (typeof before === "string")
      console.log("Before must be a number. ISO8601 timestamp.");
    if (!limit) console.log("No limit provided.");
    if (typeof limit === "string") console.log("Limit must be a number.");
    const data = {
      before: before,
      limit: limit,
    };
    try {
      let url = `${this.baseURL}/channels/${channelID}/threads/archived/private?before=${data.before}&limit=${data.limit}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const threads = await axios.get(url, data, { headers });
      return threads.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Public Archived Threads
  async listPublicArchivedThreads(channelID, before, limit) {
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!before) console.log("No before provided.");
    if (typeof before === "string")
      console.log("Before must be a number. ISO8601 timestamp.");
    if (!limit) console.log("No limit provided.");
    if (typeof limit === "string") console.log("Limit must be a number.");
    const data = {
      before: before,
      limit: limit,
    };
    try {
      let url = `${this.baseURL}/channels/${channelID}/threads/archived/public?before=${data.before}&limit=${data.limit}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const threads = await axios.get(url, data, { headers });
      return threads.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Thread Members
  async listThreadMembers(channelID) {
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
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
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!userID) console.log("No user ID provided.");
    if (typeof userID === "string") console.log("User ID must be a number.");
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
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!userID) console.log("No user ID provided.");
    if (typeof userID === "string") console.log("User ID must be a number.");
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
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
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
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!userID) console.log("No user ID provided.");
    if (typeof userID === "string") console.log("User ID must be a number.");
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
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
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
  async startThreadInForumChannel(
    channelID,
    name,
    message,
    autoArchiveDuration = null,
    rateLimitPerUser = null,
    appliedTags
  ) {
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!name) console.log("No thread name provided.");
    if (typeof name !== "string") console.log("Thread name must be a string.");
    if (!message) console.log("No message content provided.");
    if (typeof message !== "object") console.log("Message must be an object.");
    if (autoArchiveDuration && typeof autoArchiveDuration !== "number")
      console.log("Auto archive duration must be a number.");
    if (rateLimitPerUser && typeof rateLimitPerUser !== "number")
      console.log("Rate limit per user must be a number.");
    if (appliedTags && typeof appliedTags !== "array")
      console.log("Applied tags must be an array.");
    const data = {
      name: name,
      message: message,
      auto_archive_duration: autoArchiveDuration,
      rate_limit_per_user: rateLimitPerUser,
      applied_tags: appliedTags,
    };
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
  async startThreadWithoutMessage(
    channelID,
    channelName,
    autoArchiveDuration = null,
    type = null,
    invitable = null,
    rateLimitPerUser = null
  ) {
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!channelName) console.log("No channel name provided.");
    if (typeof channelName !== "string")
      console.log("Channel name must be a string.");
    if (autoArchiveDuration) {
      if (typeof autoArchiveDuration === "string")
        console.log("Auto archive duration must be a number.");
    }
    if (type) {
      if (typeof type === "string") console.log("Type must be a number.");
    }
    if (invitable) {
      if (typeof invitable !== "boolean")
        console.log("Invitable must be a boolean.");
    }
    if (rateLimitPerUser) {
      if (typeof rateLimitPerUser === "string")
        console.log("Rate limit per user must be a number.");
    }
    const data = {
      name: channelName,
      auto_archive_duration: autoArchiveDuration,
      type: type,
      invitable: invitable,
      rate_limit_per_user: rateLimitPerUser,
    };
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
  async startThreadFromMessage(
    channelID,
    messageID,
    channelName,
    autoArchiveDuration = null,
    rateLimitPerUser = null
  ) {
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!messageID) console.log("No message ID provided.");
    if (typeof messageID === "string")
      console.log("Message ID must be a number.");
    if (!channelName) console.log("No channel name provided.");
    if (typeof channelName !== "string")
      console.log("Channel name must be a string.");
    if (autoArchiveDuration) {
      if (typeof autoArchiveDuration !== "number")
        console.log("Auto archive duration must be a number.");
    }
    if (rateLimitPerUser) {
      if (typeof rateLimitPerUser !== "number")
        console.log("Rate limit per user must be a number.");
    }
    const data = {
      name: channelName,
      auto_archive_duration: autoArchiveDuration,
      rate_limit_per_user: rateLimitPerUser,
    };
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
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!messageID) console.log("No message ID provided.");
    if (typeof messageID === "string")
      console.log("Message ID must be a number.");
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
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (!messageID) console.log("No message ID provided.");
    if (typeof messageID === "string")
      console.log("Message ID must be a number.");
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
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
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
    if (!channelID) console.log("No channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
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
  async followAnnouncementChannel(channelID, targetChannel) {
    if (!channelID) console.log("No channel ID provided.");
    if (!targetChannel) console.log("No target channel ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (typeof targetChannel === "string")
      console.log("Target channel ID must be a number.");
    const data = {
      webhook_channel_id: targetChannel,
    };
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
    if (!channelID) console.log("No channel ID provided.");
    if (!overwriteID) console.log("No overwrite ID provided.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (typeof overwriteID === "string")
      console.log("Overwrite ID must be a number.");
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
    if (!messageID) console.log("No message ID provided.");
    if (!channelID) console.log("No channel ID provided.");
    if (!emoji) console.log("No emoji provided.");
    if (typeof messageID === "string")
      console.log("Message ID must be a number.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (typeof emoji === "string") console.log("Emoji must be a string.");
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
    if (!messageID) console.log("No message ID provided.");
    if (!channelID) console.log("No channel ID provided.");
    if (typeof messageID === "string")
      console.log("Message ID must be a number.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
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
    if (!messageID) console.log("No message ID provided.");
    if (!channelID) console.log("No channel ID provided.");
    if (!emoji) console.log("No emoji provided.");
    if (typeof messageID === "string")
      console.log("Message ID must be a number.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (typeof emoji === "string") console.log("Emoji must be a string.");
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
    if (!messageID) console.log("No message ID provided.");
    if (!channelID) console.log("No channel ID provided.");
    if (!emoji) console.log("No emoji provided.");
    if (!userID) console.log("No user ID provided.");
    if (typeof messageID === "string")
      console.log("Message ID must be a number.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (typeof emoji === "string") console.log("Emoji must be a string.");
    if (typeof userID === "string") console.log("User ID must be a number.");
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
    if (!messageID) console.log("No message ID provided.");
    if (!channelID) console.log("No channel ID provided.");
    if (!emoji) console.log("No emoji provided.");
    if (typeof messageID === "string")
      console.log("Message ID must be a number.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (typeof emoji === "string") console.log("Emoji must be a string.");
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
    if (!messageID) console.log("No message ID provided.");
    if (!channelID) console.log("No channel ID provided.");
    if (!emoji) console.log("No emoji provided.");
    if (typeof messageID === "string")
      console.log("Message ID must be a number.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    if (typeof emoji === "string") console.log("Emoji must be a string.");
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
    if (!messageID) console.log("No message ID provided.");
    if (!channelID) console.log("No channel ID provided.");
    if (typeof messageID === "string")
      console.log("Message ID must be a number.");
    if (typeof channelID === "string")
      console.log("Channel ID must be a number.");
    try {
      let url = `${this.baseURL}/channels/${channelID}/messages/${messageID}/crosspost`;
      let headers = { Authorization: `Bot ${this.token}` };
      const message = await axios.post(url, { headers });
      return message.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Set client.guild to current guild object
  async getCurrentGuild() {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const guild = await axios.get(url, { headers });
      this.guild = guild.data;
      return guild.data;
    } catch (err) {
      console.error(err);
    }
  }

  // List Auto Moderation Rules for Guild
  async listAutoModerationRulesForGuild() {
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/auto-moderation/rules`;
      let headers = { Authorization: `Bot ${this.token}` };
      const rules = await axios.get(url, { headers });
      return rules.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Get Auto Moderation Rule
  async getAutoModerationRule(ruleID) {
    if (!ruleID) console.log("No rule ID provided.");
    if (typeof ruleID !== "string") console.log("Rule ID must be a string.");
    try {
      let url = `${this.baseURL}/guilds/${this.currentGuildID}/auto-moderation/rules/${ruleID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const rule = await axios.get(url, { headers });
      return rule.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create Auto Moderation Rule
  async createAutoModerationRule(
    guildID,
    ruleID,
    name,
    actions,
    enabled,
    exemptRoles,
    exemptChannels,
    trigger = null
  ) {
    if (!name) console.log("No name provided.");
    if (!actions) console.log("No actions provided.");
    if (!enabled) console.log("Whether the rule is enabled must be provided.");
    if (!exemptRoles) console.log("No exempt roles provided.");
    if (!exemptChannels) console.log("No exempt channels provided.");
    if (typeof name !== "string") throw new TypeError("Name must be a string.");
    if (typeof actions !== "object")
      throw new TypeError("Actions must be an array of objects.");
    if (typeof enabled !== "boolean")
      throw new TypeError("Whether the rule is enabled must be a boolean.");
    if (typeof exemptRoles !== "object")
      throw new TypeError("Exempt roles must be an array of strings.");
    if (typeof exemptChannels !== "object")
      throw new TypeError("Exempt channels must be an array of strings.");
    if (trigger) {
      if (typeof trigger !== "object")
        throw new TypeError("Trigger must be an object.");
    }
    const data = {
      name: name,
      event_type: 1,
      trigger: trigger,
      actions: actions,
      enabled: enabled,
      exempt_roles: exemptRoles,
      exempt_channels: exemptChannels,
    };
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
  async modifyAutoModerationRule(
    guildID,
    ruleID,
    name,
    actions,
    enabled,
    exemptRoles,
    exemptChannels,
    trigger = null
  ) {
    if (!name) console.log("No name provided.");
    if (!actions) console.log("No actions provided.");
    if (!enabled) console.log("Whether the rule is enabled must be provided.");
    if (!exemptRoles) console.log("No exempt roles provided.");
    if (!exemptChannels) console.log("No exempt channels provided.");
    if (typeof name !== "string") throw new TypeError("Name must be a string.");
    if (typeof actions !== "object")
      throw new TypeError("Actions must be an array of objects.");
    if (typeof enabled !== "boolean")
      throw new TypeError("Whether the rule is enabled must be a boolean.");
    if (typeof exemptRoles !== "object")
      throw new TypeError("Exempt roles must be an array of strings.");
    if (typeof exemptChannels !== "object")
      throw new TypeError("Exempt channels must be an array of strings.");
    if (trigger) {
      if (typeof trigger !== "object")
        throw new TypeError("Trigger must be an object.");
    }
    const data = {
      name: name,
      event_type: 1,
      trigger: trigger,
      actions: actions,
      enabled: enabled,
      exempt_roles: exemptRoles,
      exempt_channels: exemptChannels,
    };
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
  async createGlobalSlashCommands(applicationID, name, description, options) {
    if (!applicationID) console.log("No application ID provided");
    if (!name) console.log("No name provided");
    if (!description) console.log("No description provided");
    if (typeof applicationID !== "string")
      console.log("Application ID must be a string");
    if (typeof name !== "string") console.log("Name must be a string");
    if (typeof description !== "string")
      console.log("Description must be a string");
    if (options && typeof options !== "object")
      console.log("Options must be an array of objects");
    const data = {
      name: name,
      type: 1,
      description: description,
      options: options,
    };
    try {
      let url = `${this.baseURL}/applications/${applicationID}/commands`;
      let headers = { Authorization: `Bot ${this.token}` };
      const commands = await axios.post(url, data, { headers });
      this.interactionID = commands.data.id;
      this.interactionToken = commands.data.token;
      console.log(commands.data);
      return commands.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Reply to an interaction with a message (slash commands)
  async replyToInteraction(interaction, content) {
    if (!content) console.log("No content provided");
    if (typeof content !== "string") console.log("Content must be a string");
    const data = {
      type: 4,
      data: {
          content: content
      }
    };
    try {
      let url = `${this.baseURL}/interactions/${interaction.id}/${interaction.token}/callback`;
      let headers = { Authorization: `Bot ${this.token}` };
      const reply = await axios.post(url, data, { headers });
      return reply.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create guild slash commands
  async createGuildSlashCommands(applicationID, name, description, options) {
    if (!applicationID) console.log("No application ID provided");
    if (!name) console.log("No name provided");
    if (!description) console.log("No description provided");
    if (typeof applicationID !== "string")
      console.log("Application ID must be a string");
    if (typeof name !== "string") console.log("Name must be a string");
    if (typeof description !== "string")
      console.log("Description must be a string");
    if (typeof options !== "object")
      console.log("Options must be an array of objects");
    const data = {
      name: name,
      type: 1,
      description: description,
      options: options,
    };
    try {
      let url = `${this.baseURL}/applications/${applicationID}/guilds/${this.currentGuildID}/commands`;
      let headers = { Authorization: `Bot ${this.token}` };
      const commands = await axios.post(url, data, { headers });
      return commands.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create user context menu commands
  async createUserContextMenuCommands(
    applicationID,
    name,
    description,
    options
  ) {
    if (!applicationID) console.log("No application ID provided");
    if (!name) console.log("No name provided");
    if (!description) console.log("No description provided");
    if (typeof applicationID !== "string")
      console.log("Application ID must be a string");
    if (typeof name !== "string") console.log("Name must be a string");
    if (typeof description !== "string")
      console.log("Description must be a string");
    if (typeof options !== "object")
      console.log("Options must be an array of objects");
    const data = {
      name: name,
      type: 2,
      description: description,
      options: options,
    };
    try {
      let url = `${this.baseURL}/applications/${applicationID}/commands`;
      let headers = { Authorization: `Bot ${this.token}` };
      const commands = await axios.post(url, data, { headers });
      return commands.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Create message context menu commands
  async createMessageContextMenuCommands(
    applicationID,
    name,
    description,
    options
  ) {
    if (!applicationID) console.log("No application ID provided");
    if (!name) console.log("No name provided");
    if (!description) console.log("No description provided");
    if (typeof applicationID !== "string")
      console.log("Application ID must be a string");
    if (typeof name !== "string") console.log("Name must be a string");
    if (typeof description !== "string")
      console.log("Description must be a string");
    if (typeof options !== "object")
      console.log("Options must be an array of objects");
    const data = {
      name: name,
      type: 3,
      description: description,
      options: options,
    };
    try {
      let url = `${this.baseURL}/applications/${applicationID}/commands`;
      let headers = { Authorization: `Bot ${this.token}` };
      const commands = await axios.post(url, data, { headers });
      return commands.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Refresh Application Commands
  async deleteApplicationCommands(applicationID, commandID) {
    if (!applicationID) console.log("No application ID provided");
    if (!commandID) console.log("No command ID provided");
    if (typeof applicationID !== "string")
      console.log("Application ID must be a string");
    if (typeof commandID !== "string")
      console.log("Command ID must be a string");
    try {
      let url = `${this.baseURL}/applications/${applicationID}/guilds/${this.currentGuildID}/commands/${commandID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const commands = await axios.delete(url, { headers });
      return commands.data;
    } catch (err) {
      console.error(err);
    }
  }

  // Refresh Global Application Commands
  async deleteGlobalApplicationCommands(applicationID, commandID) {
    if (!applicationID) console.log("No application ID provided");
    if (!commandID) console.log("No command ID provided");
    if (typeof applicationID !== "string")
      console.log("Application ID must be a string");
    if (typeof commandID !== "string")
      console.log("Command ID must be a string");
    try {
      let url = `${this.baseURL}/applications/${applicationID}/commands/${commandID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const commands = await axios.delete(url, { headers });
      return commands.data;
    } catch (err) {
      console.error(err);
    }
  }

  // create a stage instance
  async createStageInstance(channelID, topic, privacyLevel, sendNotifications) {
    if (!channelID) console.log("Channel ID is required");
    if (!topic) console.log("Topic is required");
    if (!privacyLevel) console.log("Privacy Level is required");
    if (!sendNotifications) console.log("Send Notifications is required");
    if (typeof channelID !== "string")
      console.log("Channel ID must be a string");
    if (typeof topic !== "string") console.log("Topic must be a string");
    if (typeof privacyLevel !== "number")
      console.log("Privacy Level must be a number");
    if (typeof sendNotifications !== "boolean")
      console.log("Send Notifications must be a boolean");
    const data = {
      channel_id: channelID,
      topic: topic,
      privacy_level: privacyLevel,
      send_notifications: sendNotifications,
    };
    try {
      let url = `${this.baseURL}/stage-instances`;
      let headers = { Authorization: `Bot ${this.token}` };
      const stageInstance = await axios.post(url, data, { headers });
      return stageInstance.data;
    } catch (err) {
      console.error(err);
    }
  }

  // get a stage instance
  async getStageInstance(channelID) {
    if (!channelID) console.log("Channel ID is required");
    if (typeof channelID !== "string")
      console.log("Channel ID must be a string");
    try {
      let url = `${this.baseURL}/stage-instances/${channelID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const stageInstance = await axios.get(url, { headers });
      return stageInstance.data;
    } catch (err) {
      console.error(err);
    }
  }

  // edit a stage instance
  async editStageInstance(channelID, topic, privacyLevel) {
    if (!channelID) console.log("Channel ID is required");
    if (!topic) console.log("Topic is required");
    if (!privacyLevel) console.log("Privacy Level is required");
    if (typeof channelID !== "string")
      console.log("Channel ID must be a string");
    if (typeof topic !== "string") console.log("Topic must be a string");
    if (typeof privacyLevel !== "number")
      console.log("Privacy Level must be a number");
    const data = {
      channel_id: channelID,
      topic: topic,
      privacy_level: privacyLevel,
    };
    try {
      let url = `${this.baseURL}/stage-instances/${channelID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const stageInstance = await axios.patch(url, data, { headers });
      return stageInstance.data;
    } catch (err) {
      console.error(err);
    }
  }

  // delete a stage instance
  async deleteStageInstance(channelID) {
    if (!channelID) console.log("Channel ID is required");
    if (typeof channelID !== "string")
      console.log("Channel ID must be a string");
    try {
      let url = `${this.baseURL}/stage-instances/${channelID}`;
      let headers = { Authorization: `Bot ${this.token}` };
      const stageInstance = await axios.delete(url, { headers });
      return stageInstance.data;
    } catch (err) {
      console.error(err);
    }
  }
}

// create strings for flags for each permission, intents, partials, and events in separate objects

// Permissions
const permissions = {
  CREATE_INSTANT_INVITE: 0x00000001,
  KICK_MEMBERS: 0x00000002,
  BAN_MEMBERS: 0x00000004,
  ADMINISTRATOR: 0x00000008,
  MANAGE_CHANNELS: 0x00000010,
  MANAGE_GUILD: 0x00000020,
  ADD_REACTIONS: 0x00000040,
  VIEW_AUDIT_LOG: 0x00000080,
  PRIORITY_SPEAKER: 0x00000100,
  STREAM: 0x00000200,
  VIEW_CHANNEL: 0x00000400,
  SEND_MESSAGES: 0x00000800,
  SEND_TTS_MESSAGES: 0x00001000,
  MANAGE_MESSAGES: 0x00002000,
  EMBED_LINKS: 0x00004000,
  ATTACH_FILES: 0x00008000,
  READ_MESSAGE_HISTORY: 0x00010000,
  MENTION_EVERYONE: 0x00020000,
  USE_EXTERNAL_EMOJIS: 0x00040000,
  VIEW_GUILD_INSIGHTS: 0x00080000,
  CONNECT: 0x00100000,
  SPEAK: 0x00200000,
  MUTE_MEMBERS: 0x00400000,
  DEAFEN_MEMBERS: 0x00800000,
  MOVE_MEMBERS: 0x01000000,
  USE_VAD: 0x02000000,
  CHANGE_NICKNAME: 0x04000000,
  MANAGE_NICKNAMES: 0x08000000,
  MANAGE_ROLES: 0x10000000,
  MANAGE_WEBHOOKS: 0x20000000,
  MANAGE_EMOJIS: 0x40000000,
};

// Intents
const intents = {
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  GUILD_BANS: 1 << 2,
  GUILD_EMOJIS: 1 << 3,
  GUILD_INTEGRATIONS: 1 << 4,
  GUILD_WEBHOOKS: 1 << 5,
  GUILD_INVITES: 1 << 6,
  GUILD_VOICE_STATES: 1 << 7,
  GUILD_PRESENCES: 1 << 8,
  GUILD_MESSAGES: 1 << 9,
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  GUILD_MESSAGE_TYPING: 1 << 11,
  DIRECT_MESSAGES: 1 << 12,
  DIRECT_MESSAGE_REACTIONS: 1 << 13,
  DIRECT_MESSAGE_TYPING: 1 << 14,
};

// Partials
const partials = {
  CHANNEL: "CHANNEL",
  GUILD_MEMBER: "GUILD_MEMBER",
  MESSAGE: "MESSAGE",
  REACTION: "REACTION",
  USER: "USER",
};

// Events
const events = {
  CHANNEL_CREATE: "CHANNEL_CREATE",
  CHANNEL_DELETE: "CHANNEL_DELETE",
  CHANNEL_PINS_UPDATE: "CHANNEL_PINS_UPDATE",
  CHANNEL_UPDATE: "CHANNEL_UPDATE",
  DEBUG: "DEBUG",
  EMOJI_CREATE: "EMOJI_CREATE",
  EMOJI_DELETE: "EMOJI_DELETE",
  EMOJI_UPDATE: "EMOJI_UPDATE",
  ERROR: "ERROR",
  GUILD_BAN_ADD: "GUILD_BAN_ADD",
  GUILD_BAN_REMOVE: "GUILD_BAN_REMOVE",
  GUILD_CREATE: "GUILD_CREATE",
  GUILD_DELETE: "GUILD_DELETE",
  GUILD_INTEGRATIONS_UPDATE: "GUILD_INTEGRATIONS_UPDATE",
  GUILD_MEMBER_ADD: "GUILD_MEMBER_ADD",
  GUILD_MEMBER_REMOVE: "GUILD_MEMBER_REMOVE",
  GUILD_MEMBER_UPDATE: "GUILD_MEMBER_UPDATE",
  GUILD_MEMBERS_CHUNK: "GUILD_MEMBERS_CHUNK",
  GUILD_ROLE_CREATE: "GUILD_ROLE_CREATE",
  GUILD_ROLE_DELETE: "GUILD_ROLE_DELETE",
  GUILD_ROLE_UPDATE: "GUILD_ROLE_UPDATE",
  GUILD_UPDATE: "GUILD_UPDATE",
  INVITE_CREATE: "INVITE_CREATE",
  INVITE_DELETE: "INVITE_DELETE",
  MESSAGE_CREATE: "MESSAGE_CREATE",
  MESSAGE_DELETE: "MESSAGE_DELETE",
  MESSAGE_DELETE_BULK: "MESSAGE_DELETE_BULK",
  MESSAGE_REACTION_ADD: "MESSAGE_REACTION_ADD",
  MESSAGE_REACTION_REMOVE: "MESSAGE_REACTION_REMOVE",
  MESSAGE_REACTION_REMOVE_ALL: "MESSAGE_REACTION_REMOVE_ALL",
  MESSAGE_REACTION_REMOVE_EMOJI: "MESSAGE_REACTION_REMOVE_EMOJI",
  MESSAGE_UPDATE: "MESSAGE_UPDATE",
  PRESENCE_UPDATE: "PRESENCE_UPDATE",
  RATE_LIMIT: "RATE_LIMIT",
  READY: "READY",
  ROLE_CREATE: "ROLE_CREATE",
  ROLE_DELETE: "ROLE_DELETE",
  ROLE_UPDATE: "ROLE_UPDATE",
  TYPING_START: "TYPING_START",
  USER_UPDATE: "USER_UPDATE",
  VOICE_STATE_UPDATE: "VOICE_STATE_UPDATE",
  WARN: "WARN",
  WEBHOOKS_UPDATE: "WEBHOOKS_UPDATE",
};

// Message Types
const messageTypes = {
  DEFAULT: 0,
  RECIPIENT_ADD: 1,
  RECIPIENT_REMOVE: 2,
  CALL: 3,
  CHANNEL_NAME_CHANGE: 4,
  CHANNEL_ICON_CHANGE: 5,
  CHANNEL_PINNED_MESSAGE: 6,
  GUILD_MEMBER_JOIN: 7,
  USER_PREMIUM_GUILD_SUBSCRIPTION: 8,
  USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_1: 9,
  USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_2: 10,
  USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_3: 11,
  CHANNEL_FOLLOW_ADD: 12,
};

// Message Activity Types
const messageActivityTypes = {
  JOIN: 1,
  SPECTATE: 2,
  LISTEN: 3,
  JOIN_REQUEST: 5,
};

// Message Flags
const messageFlags = {
  CROSSPOSTED: 1 << 0,
  IS_CROSSPOST: 1 << 1,
  SUPPRESS_EMBEDS: 1 << 2,
  SOURCE_MESSAGE_DELETED: 1 << 3,
  URGENT: 1 << 4,
};

// Message Notification Levels
const messageNotificationLevels = {
  ALL_MESSAGES: 0,
  ONLY_MENTIONS: 1,
};

// Button Styles
const buttonStyles = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
  LINK: 5,
};

// Create collection class
class Collection {
  constructor() {
    this.collection = {};
  }

  // Set
  set(key, value) {
    this.collection[key] = value;
    return this;
  }

  // Get
  get(key) {
    return this.collection[key];
  }

  // Delete
  delete(key) {
    delete this.collection[key];
    return this;
  }

  // Has
  has(key) {
    return this.collection.hasOwnProperty(key);
  }

  // Clear
  clear() {
    this.collection = {};
    return this;
  }

  // Size
  size() {
    return Object.keys(this.collection).length;
  }

  // Array
  array() {
    return Object.values(this.collection);
  }

  // Key Array
  keyArray() {
    return Object.keys(this.collection);
  }

  // First
  first() {
    return Object.values(this.collection)[0];
  }

  // First Key
  firstKey() {
    return Object.keys(this.collection)[0];
  }

  // Last
  last() {
    return Object.values(this.collection)[
      Object.values(this.collection).length - 1
    ];
  }

  // Last Key
  lastKey() {
    return Object.keys(this.collection)[
      Object.keys(this.collection).length - 1
    ];
  }

  // Random
  random() {
    return Object.values(this.collection)[
      Math.floor(Math.random() * Object.values(this.collection).length)
    ];
  }

  // Random Key
  randomKey() {
    return Object.keys(this.collection)[
      Math.floor(Math.random() * Object.keys(this.collection).length)
    ];
  }
}

// global slash command builder class with methods to build slash commands and subcommands with options and choices and permissions
class SlashCommandBuilder {
  constructor() {
    this.name = null;
    this.description = null;
    this.options = [];
    this.defaultPermission = true;
    this.type = 1;
    this.subcommands = [];
    this.subcommandGroups = [];
  }

  // set name
  setName(name) {
    if (typeof name !== "string") console.log("Name must be a string");
    if (name.length < 3 || name.length > 32)
      console.log("Name must be between 3 and 32 characters");
    this.name = name;
    return this;
  }

  // set description
  setDescription(description) {
    if (typeof description !== "string")
      console.log("Description must be a string");
    if (description.length < 1 || description.length > 100)
      console.log("Description must be between 1 and 100 characters");
    this.description = description;
    return this;
  }

  // set default permission
  setDefaultPermission(defaultPermission) {
    if (typeof defaultPermission !== "boolean")
      console.log("Default Permission must be a boolean");
    this.defaultPermission = defaultPermission;
    return this;
  }

  // add option
  addOption(option) {
    if (this.options.length >= 25)
      console.log("You can only have 25 options per command");
    if (option instanceof SlashCommandOptionBuilder) {
      this.options.push(option);
      return this;
    } else {
      console.log("Option must be an instance of SlashCommandOptionBuilder");
    }
  }

  // add subcommand
  addSubcommand(subcommand) {
    if (this.subcommands.length >= 25)
      console.log("You can only have 25 subcommands per command");
    if (subcommand instanceof SlashCommandSubcommandBuilder) {
      this.subcommands.push(subcommand);
      return this;
    } else {
      console.log(
        "Subcommand must be an instance of SlashCommandSubcommandBuilder"
      );
    }
  }

  // add subcommand group
  addSubcommandGroup(subcommandGroup) {
    if (this.subcommandGroups.length >= 25)
      console.log("You can only have 25 subcommand groups per command");
    if (subcommandGroup instanceof SlashCommandSubcommandGroupBuilder) {
      this.subcommandGroups.push(subcommandGroup);
      return this;
    } else {
      console.log(
        "Subcommand Group must be an instance of SlashCommandSubcommandGroupBuilder"
      );
    }
  }

  // build
  build() {
    if (!this.name) console.log("Name is required");
    if (!this.description) console.log("Description is required");
    if (this.subcommands.length > 0 && this.options.length > 0)
      console.log("You can only have subcommands or options, not both");
    if (this.subcommandGroups.length > 0 && this.options.length > 0)
      console.log("You can only have subcommand groups or options, not both");
    if (this.subcommandGroups.length > 0 && this.subcommands.length > 0)
      console.log(
        "You can only have subcommand groups or subcommands, not both"
      );
    if (this.subcommands.length > 0) this.type = 2;
    if (this.subcommandGroups.length > 0) this.type = 3;
    return {
      name: this.name,
      description: this.description,
      options: this.options.map((option) => option.build()),
      default_permission: this.defaultPermission,
      type: this.type,
      subcommands: this.subcommands.map((subcommand) => subcommand.build()),
      subcommandGroups: this.subcommandGroups.map((subcommandGroup) =>
        subcommandGroup.build()
      ),
    };
  }
}

// Slash Command Option Builder
class SlashCommandOptionBuilder {
  constructor() {
    this.name = null;
    this.description = null;
    this.type = null;
    this.required = false;
    this.choices = [];
    this.options = [];
  }

  // set name
  setName(name) {
    if (typeof name !== "string") console.log("Name must be a string");
    if (name.length < 3 || name.length > 32)
      console.log("Name must be between 3 and 32 characters");
    this.name = name;
    return this;
  }

  // set description
  setDescription(description) {
    if (typeof description !== "string")
      console.log("Description must be a string");
    if (description.length < 1 || description.length > 100)
      console.log("Description must be between 1 and 100 characters");
    this.description = description;
    return this;
  }

  // set type
  setType(type) {
    if (typeof type !== "number") console.log("Type must be a number");
    if (type < 1 || type > 9)
      console.log("Type must be a valid Discord slash command option type");

    this.type = type;
    return this;
  }

  // set required
  setRequired(required) {
    if (typeof required !== "boolean")
      console.log("Required must be a boolean");
    this.required = required;
    return this;
  }

  // add choice
  addChoice(name, value) {
    if (this.choices.length >= 25)
      console.log("You can only have 25 choices per option");
    if (typeof name !== "string") console.log("Name must be a string");
    if (name.length < 1 || name.length > 100)
      console.log("Name must be between 1 and 100 characters");
    if (typeof value !== "string" && typeof value !== "number")
      console.log("Value must be a string or number");
    this.choices.push({ name, value });
    return this;
  }

  // add option
  addOption(option) {
    if (this.options.length >= 25)
      console.log("You can only have 25 options per option");
    if (option instanceof SlashCommandOptionBuilder) {
      this.options.push(option);
      return this;
    } else {
      console.log("Option must be an instance of SlashCommandOptionBuilder");
    }
  }

  // build
  build() {
    if (!this.name) console.log("Name is required");
    if (!this.description) console.log("Description is required");
    if (!this.type) console.log("Type is required");
    if (this.type === 1 && this.options.length > 0)
      console.log("You can't have options on a string option");
    if (this.type === 2 && this.options.length > 0)
      console.log("You can't have options on a integer option");
    if (this.type === 3 && this.options.length > 0)
      console.log("You can't have options on a boolean option");
    if (this.type === 4 && this.options.length > 0)
      console.log("You can't have options on a user option");
    if (this.type === 5 && this.options.length > 0)
      console.log("You can't have options on a channel option");
    if (this.type === 6 && this.options.length > 0)
      console.log("You can't have options on a role option");
    if (this.type === 7 && this.options.length > 0)
      console.log("You can't have options on a mentionable option");
    if (this.type === 8 && this.options.length > 0)
      console.log("You can't have options on a number option");
    return {
      name: this.name,
      description: this.description,
      type: this.type,
      required: this.required,
      choices: this.choices,
      options: this.options.map((option) => option.build()),
    };
  }
}

// SlashCommandSubcommandBuilder
class SlashCommandSubcommandBuilder {
  constructor() {
    this.name = null;
    this.description = null;
    this.options = [];
  }

  // set name
  setName(name) {
    if (typeof name !== "string") console.log("Name must be a string");
    if (name.length < 3 || name.length > 32)
      console.log("Name must be between 3 and 32 characters");
    this.name = name;
    return this;
  }

  // set description
  setDescription(description) {
    if (typeof description !== "string")
      console.log("Description must be a string");
    if (description.length < 1 || description.length > 100)
      console.log("Description must be between 1 and 100 characters");
    this.description = description;
    return this;
  }

  // add option
  addOption(option) {
    if (this.options.length >= 25)
      console.log("You can only have 25 options per option");
    if (option instanceof SlashCommandOptionBuilder) {
      this.options.push(option);
      return this;
    } else {
      console.log("Option must be an instance of SlashCommandOptionBuilder");
    }
  }

  // build
  build() {
    if (!this.name) console.log("Name is required");
    if (!this.description) console.log("Description is required");
    return {
      name: this.name,
      description: this.description,
      type: 1,
      options: this.options.map((option) => option.build()),
    };
  }
}

// SlashCommandSubcommandGroupBuilder
class SlashCommandSubcommandGroupBuilder {
  constructor() {
    this.name = null;
    this.description = null;
    this.options = [];
  }

  // set name
  setName(name) {
    if (typeof name !== "string") console.log("Name must be a string");
    if (name.length < 3 || name.length > 32)
      console.log("Name must be between 3 and 32 characters");
    this.name = name;
    return this;
  }

  // set description
  setDescription(description) {
    if (typeof description !== "string")
      console.log("Description must be a string");
    if (description.length < 1 || description.length > 100)
      console.log("Description must be between 1 and 100 characters");
    this.description = description;
    return this;
  }

  // add option
  addOption(option) {
    if (this.options.length >= 25)
      console.log("You can only have 25 options per option");
    if (option instanceof SlashCommandSubcommandBuilder) {
      this.options.push(option);
      return this;
    } else {
      console.log(
        "Option must be an instance of SlashCommandSubcommandBuilder"
      );
    }
  }

  // build
  build() {
    if (!this.name) console.log("Name is required");
    if (!this.description) console.log("Description is required");
    return {
      name: this.name,
      description: this.description,
      type: 2,
      options: this.options.map((option) => option.build()),
    };
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
      throw new TypeError(
        "Style must be a 'primary, secondary, success, danger'."
      );
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

// Create cooldowns using quick.db
class Cooldown {
  constructor() {
    this.db = new QuickDB();
  }

  // Set cooldown
  async setCooldown(command, time) {
    // Check if command is a string
    if (typeof command !== "string") {
      throw new TypeError("Command must be a string.");
    }

    // Check if time is a number
    if (typeof time !== "number") {
      throw new TypeError("Time must be a number.");
    }

    const storedate = Date.now() + time;

    // Set cooldown
    await this.db.set(command, storedate);
    return await this.db.get(command);
  }

  // Get cooldown
  async getCooldown(command) {
    // Check if command is a string
    if (typeof command !== "string") {
      throw new TypeError("Command must be a string.");
    }

    // Get cooldown
    return await Math.abs(this.db.get(command));
  }

  // Delete cooldown
  async deleteCooldown(command) {
    // Check if command is a string
    if (typeof command !== "string") {
      throw new TypeError("Command must be a string.");
    }

    // Delete cooldown
    await this.db.delete(command);
    return await this.db.get(command);
  }
}

module.exports = {
  SwyftDiscord,
  EmbedBuilder,
  ButtonBuilder,
  SelectMenuBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  ModalBuilder,
  Collection,
  Cooldown,
  SlashCommandBuilder,
  SlashCommandOptionBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
  permissions,
  intents,
  partials,
  events,
  messageTypes,
  messageActivityTypes,
  messageFlags,
  messageNotificationLevels,
  buttonStyles,
};
