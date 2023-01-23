const { colorList } = require("./colors");

/**
 * A class for creating and modifying Discord embeds easily.
 *
 * @example
 * const embed = new EmbedBuilder();
 * @returns {EmbedBuilder}
 */
class EmbedBuilder {
  constructor() {
    this.embed = { type: "rich", description: "" };

    // Mapping of color words to color values
    this.colors = colorList;
  }

  /**
   * Sets the title of the embed.
   *
   * @param {string} title - The title to set.
   * @returns {void}
   *
   * @example
   * let embed = new EmbedBuilder();
   * embed.setTitle("Hello, World!"); // sets the title to "Hello, World!"
   */
  setTitle(title) {
    if (typeof title === "string") {
      this.embed.title = title;
    } else {
      console.error("Invalid title: must be a string");
    }
  }

  /**
   * Sets the description of the embed.
   *
   * @param {string} description - The description to set.
   * @returns {void}
   *
   * @example
   * let embed = new EmbedBuilder();
   * embed.setDescription("This is a description."); // sets the description to "This is a description."
   */
  setDescription(description) {
    if (typeof description === "string") {
      this.embed.description = description;
    } else {
      console.error("Invalid description: must be a string");
    }
  }

  /**
   * Sets the color of the embed.
   * @param {number|string} color - The color to set, represented as a decimal number, hex code or a color word.
   * @returns {void}
   * @example
   * let embed = new EmbedBuilder();
   * embed.setColor(0xff0000); // sets the color to red (decimal value)
   * embed.setColor("#ff0000"); // sets the color to red (hex code)
   * embed.setColor("Red"); // sets the color to red (color word)
   */
  setColor(color) {
    color = color.toLowerCase();
    if (color === "random") {
      // Generate a random number between 0 and the number of colors
      const randomIndex = Math.floor(
        Math.random() * Object.keys(this.colors).length
      );

      // Get the name of the color at the random index
      const randomColorName = Object.keys(this.colors)[randomIndex];

      // Set the color of the embed to the random color
      this.embed.color = this.colors[randomColorName];
    } else if (this.colors[color]) {
      // Set the color of the embed to the provided color
      this.embed.color = this.colors[color];
    } else if (color[0] === "#") {
      // Convert hex value to number
      color = parseInt(color.slice(1), 16);
      this.embed.color = color;
    } else if (typeof color === "number") {
      this.embed.color = color;
    } else {
      throw new Error(
        "Invalid color: must be a number, a valid color word, or a hex value"
      );
    }
  }

  /**
   * Adds a field to the embed.
   *
   * @param {string} name - The name of the field.
   * @param {string} value - The value of the field.
   * @param {boolean|string} [inline=true] - Whether the field should be displayed inline or not. Can be a boolean or a string with the value "true" or "false".
   * @returns {void}
   *
   * @example
   * let embed = new EmbedBuilder();
   * embed.addField("Field Name", "Field Value", true); // adds a field with name "Field Name" and value "Field Value" that is displayed inline
   * embed.addField("Field Name 2", "Field Value 2", false); // adds a field with name "Field Name 2" and value "Field Value 2" that is not displayed inline
   */
  addField(name, value, inline) {
    if (typeof name === "string" && typeof value === "string") {
      if (!this.embed.fields) this.embed.fields = [];

      if (typeof inline === "string") {
        // If it's a string, convert it to a boolean
        inline = inline.toLowerCase() === "true";
      }

      this.embed.fields.push({ name, value, inline: inline || false });
    } else {
      console.error("Invalid field: name and value must be strings");
    }
  }

  /**
   * Adds fields to the embed.
   *
   * @param {...(string[])|...{name: string, value: string, inline?: boolean}} fields - The fields to add. Each field must have a name and a value, both of which must be strings. The inline parameter is optional and defaults to false. Can also be passed as an array of arrays, with each inner array containing the field name, field value, and inline value in that order.
   * @returns {void}
   *
   * @example
   * let embed = new EmbedBuilder();
   *
   * // Using an array of objects
   * embed.addFields({name: "Field Name", value: "Field Value", inline: true}, {name: "Field Name 2", value: "Field Value 2", inline: true});
   *
   * // Using a regular array
   * embed.addFields(['Field Name', 'Field Value', true], ['Field Name 2', 'Field Value 2', false]);
   *
   * // Using an array of arrays
   * const fields = [
   *   ['Field Name', 'Field Value', true],
   *   ['Field Name 2', 'Field Value 2', false]
   * ];
   * embed.addFields(fields);
   */
  addFields(...fields) {
    if (Array.isArray(fields)) {
      if (!this.embed.fields) this.embed.fields = [];
      fields.forEach((field) => {
        if (
          Array.isArray(field) &&
          field.length === 3 &&
          typeof field[0] === "string" &&
          typeof field[1] === "string"
        ) {
          // Set default value for inline to false
          const inline = field[2] || false;
          this.embed.fields.push({ name: field[0], value: field[1], inline });
        } else if (
          typeof field.name === "string" &&
          typeof field.value === "string"
        ) {
          field.inline = field.inline || false;
          this.embed.fields.push(field);
        } else {
          console.error("Invalid field: both name and value must be strings");
        }
      });
    } else {
      console.error("Invalid fields: must be an array");
    }
  }

  /**
   * Sets the author of the embed.
   *
   * @param {string} name - The name of the author.
   * @param {string} [iconURL=''] - The URL of the icon for the author. Optional.
   * @param {string} [url] - The URL of the author. Optional.
   * @returns {void}
   *
   * @example
   * let embed = new EmbedBuilder();
   * embed.setAuthor("John Smith", "https://example.com/icon.png", "https://example.com");  // sets all three fields
   * embed.setAuthor("Jane Doe", "https://example.com");  // sets name and url, iconURL is set to default value
   * embed.setAuthor("Bob Smith");  // sets name only, iconURL and url are set to default values
   */
  setAuthor(name, iconURL = "", url) {
    if (typeof name === "string") {
      this.embed.author = { name };
      if (typeof iconURL === "string") {
        this.embed.author.icon_url = iconURL;
      }
      if (typeof url === "string") {
        this.embed.author.url = url;
      }
    } else {
      console.error("Invalid author: name must be a string");
    }
  }

  /**
   * Adds a blank field to the embed.
   *
   * @param {boolean} [inline=true] - Whether the field should be displayed inline.
   * @returns {void}
   *
   * @example
   * let embed = new EmbedBuilder();
   * embed.addBlankField(); // adds a blank field to the embed
   * embed.addBlankField(false); // adds a blank field that is not displayed inline
   */
  addBlankField(inline = true) {
    if (!this.embed.fields) this.embed.fields = [];
    this.embed.fields.push({ name: "\u200B", value: "\u200B", inline });
  }

  /**
   * Sets the footer of the embed.
   *
   * @param {string} text - The text to display in the footer.
   * @param {string} [iconURL] - The URL of the icon to display in the footer.
   * @returns {void}
   *
   * @example
   * let embed = new EmbedBuilder();
   * embed.setFooter("This is the footer");
   * embed.setFooter("This is the footer", "https://example.com/footer-icon.png");
   */
  setFooter(text, iconURL) {
    if (typeof text === "string") {
      this.embed.footer = { text };
      if (typeof iconURL === "string") {
        this.embed.footer.icon_url = iconURL;
      }
    } else {
      console.error("Invalid footer: text must be a string");
    }
  }

  /**
   * Sets the thumbnail of the embed.
   *
   * @param {string} url - The URL of the thumbnail.
   * @returns {void}
   *
   * @example
   * let embed = new EmbedBuilder();
   * embed.setThumbnail("https://example.com/thumbnail.png");
   */
  setThumbnail(url) {
    if (typeof url === "string") {
      this.embed.thumbnail = { url };
    } else {
      console.error("Invalid thumbnail: url must be a string");
    }
  }

  /**
   * Sets the image of the embed.
   *
   * @param {string} url - The URL of the image.
   * @returns {void}
   *
   * @example
   * let embed = new EmbedBuilder();
   * embed.setImage("https://example.com/image.png");
   */
  setImage(url) {
    if (typeof url === "string") {
      this.embed.image = { url };
    } else {
      console.error("Invalid image: url must be a string");
    }
  }

  /**
   * Sets the timestamp of the embed.
   *
   * @param {boolean} [timestamp=true] - Whether to include the current timestamp or not.
   * @returns {void}
   *
   * @example
   * let embed = new EmbedBuilder();
   * embed.setTimestamp(); // includes the current timestamp in the embed
   * embed.setTimestamp(false); // does not include the timestamp in the embed
   */
  setTimestamp(currentTime) {
    if (currentTime) {
      this.embed.timestamp = new Date();
    }
  }

  // new method
  toJSON() {
    return this.embed;
  }
}

module.exports = {
  EmbedBuilder: EmbedBuilder,
};