let Backbone = require("backbone");
let Handlebars = require('handlebars/runtime').default;

const STATE_NOT_READY = 1;
const STATE_READY = 2;

Handlebars.registerHelper("treeTable", function(comp) {
  let tree = comp.tree;
  if (!tree || !tree.length) return "";
  let size = tree.length;
  let height = 32 - Math.clz32(size);
  // left & right trees are divided, thus height - 1
  tree[0].span = 1 << (height - 1);
  for (let i = 0; i < (1 << height) - 1; i++) {
    let level = 32 - Math.clz32(i + 1);
    tree[i] = tree[i] || {};
    tree[i].span = 1 << (height - level);
  }
  let left = collect(tree, 1, false);
  let right = collect(tree, 2, true);
  if (left[0]) left[0].push(tree[0]);
  else left[0] = [tree[0]];

  let out = "";
  for (let i = 0; i < left.length; i++) {
    out += "<tr>"
    for (let node of left[i].concat(right[i] || [])) {
      let nodeClass = getNodeClass(node, tree);
      nodeClass.push("node");
      out += `<td rowspan="${node.span}" class="${nodeClass.join(" ")}">${innerTable(node, comp)}</td>`;
    }
    out += "</tr>";
  }
  return out;
});

function getNodeClass(node, tree) {
  if (!node.nodeIndex && node.nodeIndex !== 0) {
    return ["empty-node"];
  }
  let nodeClass = [];
  let childIndex = 2 * node.nodeIndex + 1;
  if (!tree[childIndex] || !tree[childIndex].nodeIndex) {
    nodeClass.push("leaf");
  }
  if (node.nodeIndex <= 2) {
    nodeClass.push("root");
  } else {
    nodeClass.push(node.nodeIndex % 2 === 0 ? "right-node" : "left-node");
    nodeClass.push(node.reverse ? "right-tree" : "left-tree");
  }
  return nodeClass;
}

function innerTable(node, comp) {
  if (!node.nodeIndex && node.nodeIndex !== 0) return "";
  node.players = node.players || [];
  node.bandNames = node.bandNames || [];
  let out = `<div class="inner-table" data-index="${node.nodeIndex}"><table>`;
  for (let i = 0; i < Math.max(node.players.length, 1); i++) {
    if (node.players && node.players[i]) {
      out += `<tr data-username=${node.players[i]}><td>${node.bandNames[i]}(${node.players[i]})`;
    } else {
      out += "<tr><td>";
    }
    out += "</td>";
    if (!node.winner && node.me && node.me === node.players[i]) {
      if (node.myState === STATE_NOT_READY) {
        out += '<td><button class="btn btn-success button-prepare">准备</button></td>';
      } else {
        out += '<td><button class="btn btn-warning button-cancel-prepare">取消</button></td>';
      }
    } else if (node.winner && node.winner === node.players[i]) {
      out += '<td class="winner-badge"></td>';
    } else if (node.players[i] && comp.isAdmin) {
      out += '<td><button class="btn btn-danger button-force-win">保送</button></td>';
    } else {
      out += "<td></td>";
    }
    out += "</tr>";
  }
  out += "</table></div>";
  return out;
}

function collect(tree, top, reverse) {
  if (top >= tree.length) return [];
  tree[top].reverse = reverse;
  let left = collect(tree, top * 2 + 1, reverse);
  if (left && left[0]) {
    if (reverse) {
      left[0].unshift(tree[top]);
    } else {
      left[0].push(tree[top]);
    }
  } else {
    left = [[tree[top]]];
  }
  return left.concat(collect(tree, top * 2 + 2, reverse));
}

let Tree = Backbone.View.extend({
  template: require("../../templates/competition/tree.handlebars"),
  initialize: function(options) {
    this.app = options.app;
    this.user = this.app.user;
    this._compId = options.compId;
    this._comp = {};
    this.listenTo(this.user, "change:serverStatus", this.renderStatus.bind(this));
    this.app.receive("response:competition", this.onCompResponse.bind(this));
    this.refresh();
    $(".gwent-battle").html(this.el);
    this.render();
  },
  events: {
    "click .button-quit": "close",
    "click .button-prepare": "doPrepare",
    "click .button-cancel-prepare": "doPrepare",
    "click .button-force-win": "forcePlayerWin",
  },
  refresh: function() {
    this.app.send("request:competition", {
      compId: this._compId,
      includeTree: true,
    });
  },
  close: function() {
    this.app.goBack();
  },
  render: function() {
    this.$el.html(this.template({
      comp: this._comp,
    }));
    this.renderStatus();
    this.restoreScroll_();
    return this;
  },
  renderStatus: function() {
    let data = this.user.get("serverStatus");
    this.$el.find(".nr-player-online").html(data.online);
    this.$el.find(".nr-player-idle").html(data.idle);
  },
  onCompResponse: function(comp) {
    this._comp = comp;
    this._comp.isAdmin = this.user.get("userModel").isAdmin;

    let myNode = this.getMyNode_();
    if (myNode) {
      myNode.me = this.user.get("userModel").username;
      myNode.myState = STATE_NOT_READY;
    }
    this.render();
  },
  doPrepare: function() {
    let myNode = this.getMyNode_();
    if (!myNode) return;
    if (myNode.myState === STATE_NOT_READY) {
      myNode.myState = STATE_READY;
      this.app.send("request:compReady", {
        compId: this._compId,
        nodeIndex: myNode.nodeIndex,
      })
    } else {
      myNode.myState = STATE_NOT_READY;
    }
    this.rememberScroll_();
    this.render();
  },
  forcePlayerWin: function(e) {
    if (!this.user.get("userModel").isAdmin) return;
    let username = $(e.target).closest("tr").data("username");
    let nodeIndex = $(e.target).closest(".inner-table").data("index");
    this.app.send("request:compForceWin", {
      username,
      nodeIndex,
      compId: this._comp.id,
    });
    setTimeout(() => {
      this.rememberScroll_();
      this.refresh();
    }, 100);
  },
  getMyNode_: function() {
    if (!this._comp.tree) {
      return null;
    }
    let username = this.user.get("userModel").username;
    return this._comp.tree.find(node => {
      return node && node.players && node.players.includes(username);
    });
  },
  rememberScroll_: function() {
    let top = $(".panel-body").scrollTop();
    let left = $(".panel-body").scrollLeft();
    this.scrollPosition_ = [top, left];
  },
  restoreScroll_: function() {
    if (!this.scrollPosition_) return;
    $(".panel-body").scrollTop(this.scrollPosition_[0]);
    $(".panel-body").scrollLeft(this.scrollPosition_[1]);
  },
});

module.exports = Tree;
