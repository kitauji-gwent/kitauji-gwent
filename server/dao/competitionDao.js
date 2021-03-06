const shortid = require("shortid");
const DB = require("./db");
const Const = require("../Const");

/**
 * id
 * name
 * startTime
 * capacity
 * mode
 * funDeck
 * state
 */
const TABLE_COMPETITION = "competition";
/**
 * username
 * compId
 * compName
 * grade
 * userRank
 */
const TABLE_USER_COMP_REL = "user_competition_rel";
/**
 * compId
 * nodeIndex
 * players: Array
 * winner
 * recordUrl
 */
const TABLE_COMP_GAME_RECORD = "competition_game_record";

let instance_;

class CompetitionDao {
  constructor() {}
  
  static getInstance() {
    if (!instance_) instance_ = new CompetitionDao();
    return instance_;
  }

  async addCompetition(comp) {
    const table = DB.getInstance().db.collection(TABLE_COMPETITION);
    comp = CompetitionDao.toCompetitionDto_(comp);
    await table.insertOne(comp);
    return comp;
  }

  async deleteCompetition(compId) {
    const table = DB.getInstance().db.collection(TABLE_COMPETITION);
    await table.deleteOne({id: compId});
  }

  async getCompetitions() {
    await DB.getInstance().connectPromise;
    const table = DB.getInstance().db.collection(TABLE_COMPETITION);
    return await table.find({}, {
      projection: {_id: 0},
      limit: 20,
    }).toArray();
  }

  async getNotStartedCompetitions() {
    await DB.getInstance().connectPromise;
    const table = DB.getInstance().db.collection(TABLE_COMPETITION);
    return await table.find({
      $or: [{
        state: Const.COMP_STATE_NOT_STARTED,
      }, {
        state: Const.COMP_STATE_ENROLL_ENDED,
      }]
    }).toArray();
  }

  async getCompetitionById(id) {
    const table = DB.getInstance().db.collection(TABLE_COMPETITION);
    return await table.findOne({
      id
    });
  }

  async updateCompetition(comp) {
    let id = comp.id;
    if (!id) return false;
    const table = DB.getInstance().db.collection(TABLE_COMPETITION);
    await table.updateOne({
      id,
    }, {
      $set: {
        state: comp.state,
      }
    });
  }

  async persistCompGameRecords(records) {
    const table = DB.getInstance().db.collection(TABLE_COMP_GAME_RECORD);
    table.insertMany(records);
  }

  async loadCompGameRecords(compId) {
    const table = DB.getInstance().db.collection(TABLE_COMP_GAME_RECORD);
    return await table.find({
      compId,
    }, {
      projection: {_id: 0},
    }).toArray();
  }

  async updateGameRecord(record) {
    const table = DB.getInstance().db.collection(TABLE_COMP_GAME_RECORD);
    await table.updateOne({
      compId: record.compId,
      nodeIndex: record.nodeIndex,
    }, {
      $set: {
        players: record.players,
        bandNames: record.bandNames,
        winner: record.winner,
        winners: record.winners,
        recordUrl: record.recordUrl,
        withBot: record.withBot,
      }
    });
  }

  async getCandidates(compId) {
    const table = DB.getInstance().db.collection(TABLE_USER_COMP_REL);
    return await table.find({
      compId,
    }).toArray();
  }

  async getCandidate(username, compId) {
    const table = DB.getInstance().db.collection(TABLE_USER_COMP_REL);
    return await table.findOne({
      username,
      compId,
    });
  }

  async enroll(userModel, compId, userRank) {
    let {username, bandName, isBot} = userModel;
    let comp = await this.getCompetitionById(compId);
    if (!comp) {
      return false;
    }
    const table = DB.getInstance().db.collection(TABLE_USER_COMP_REL);
    await table.updateOne({
      username,
      compId,
    }, {
      $set: {
        compName: comp.name,
        grade: comp.capacity,
        userRank: userRank || 999,
        bandName,
        isBot,
      }
    }, {
      upsert: true,
    });
  }

  async quit(username, compId) {
    const table = DB.getInstance().db.collection(TABLE_USER_COMP_REL);
    await table.deleteOne({
      username,
      compId,
    });
  }

  async getCompetitionResult(compId, limit) {
    const table = DB.getInstance().db.collection(TABLE_USER_COMP_REL);
    return await table.find({
      compId,
    }).sort({grade: 1}).limit(limit).toArray();
  }

  async updateGrade(username, compId, grade) {
    const table = DB.getInstance().db.collection(TABLE_USER_COMP_REL);
    await table.updateOne({
      username,
      compId,
    }, {
      $set: {
        grade,
      }
    });
  }

  static toCompetitionDto_(comp) {
    let startTime = Math.max(new Date().getTime(), comp.startTime);
    let enrollEndTime = Math.min(comp.enrollEndTime || startTime, startTime);
    let prices = {};
    if (comp.prices) {
      try {
        prices = JSON.parse(comp.prices);
      } catch (e) {
      }
    }
    return {
      id: shortid.generate(),
      name: comp.name,
      organizer: comp.organizer,
      startTime,
      enrollEndTime,
      capacity: Number(comp.capacity),
      mode: comp.mode,
      funDeck: comp.mode === Const.FUN_MODE ? (comp.funDeck || Const.DEFAULT_FUN_DECK) : null,
      state: Const.COMP_STATE_NOT_STARTED,
      prices: prices,
      candidates: [],
    };
  }

}

module.exports = CompetitionDao;