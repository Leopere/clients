const HtmlWebpackPlugin = require("html-webpack-plugin");

const PLUGIN_NAME = "FirefoxForkHtmlIdentityPlugin";

function escapeHtmlText(value) {
  return value.replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });
}

function replaceIdentity(html, name) {
  const escapedName = escapeHtmlText(name);
  return html.replaceAll("Bitwarden", () => escapedName);
}

class FirefoxForkHtmlIdentityPlugin {
  constructor(name) {
    this.name = name;
  }

  apply(compiler) {
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tap(PLUGIN_NAME, (data) => {
        data.html = replaceIdentity(data.html, this.name);
        return data;
      });
    });
  }
}

module.exports = {
  FirefoxForkHtmlIdentityPlugin,
  escapeHtmlText,
  replaceIdentity,
};
