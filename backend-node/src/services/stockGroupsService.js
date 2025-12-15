const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');
const db = require('../config/db');

const STOCK_GROUPS_FILE = path.join(__dirname, '../cache/stock_groups.json');

// Helper to read from JSON file
function readStockGroupsFile() {
  try {
    if (!fs.existsSync(STOCK_GROUPS_FILE)) {
      fs.writeFileSync(STOCK_GROUPS_FILE, JSON.stringify([]), 'utf8');
      return [];
    }
    const data = fs.readFileSync(STOCK_GROUPS_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.warn('Failed to read stock groups file:', error);
    return [];
  }
}

// Helper to write to JSON file
function writeStockGroupsFile(groups) {
  try {
    fs.writeFileSync(STOCK_GROUPS_FILE, JSON.stringify(groups, null, 2), 'utf8');
  } catch (error) {
    console.warn('Failed to write stock groups file:', error);
  }
}

async function getStockGroupsFromDb(userId) {
  try {
    const client = db.getConnection();
    if (!client || !client.topology || !client.topology.isConnected()) {
      console.warn('MongoDB not connected, using JSON fallback');
      const groups = readStockGroupsFile();
      return groups.filter(g => g.userId === userId || g.userId === userId.toString());
    }

    const collection = client.db('stock_dashboard').collection('stock_groups');
    const groups = await collection.find({ userId: new ObjectId(userId) }).toArray();
    return groups;
  } catch (error) {
    console.warn('MongoDB query failed, using JSON fallback:', error.message);
    const groups = readStockGroupsFile();
    return groups.filter(g => g.userId === userId || g.userId === userId.toString());
  }
}

async function createStockGroupInDb(userId, name, tickers) {
  try {
    const client = db.getConnection();
    if (!client || !client.topology || !client.topology.isConnected()) {
      console.warn('MongoDB not connected, using JSON fallback');
      const groups = readStockGroupsFile();
      const newGroup = {
        _id: new Date().getTime().toString(),
        userId: userId.toString(),
        name,
        tickers,
        createdAt: new Date().toISOString()
      };
      groups.push(newGroup);
      writeStockGroupsFile(groups);
      return newGroup;
    }

    const collection = client.db('stock_dashboard').collection('stock_groups');
    const newGroup = {
      userId: new ObjectId(userId),
      name,
      tickers,
      createdAt: new Date()
    };
    const result = await collection.insertOne(newGroup);
    return { _id: result.insertedId, ...newGroup };
  } catch (error) {
    console.warn('MongoDB insert failed, using JSON fallback:', error.message);
    const groups = readStockGroupsFile();
    const newGroup = {
      _id: new Date().getTime().toString(),
      userId: userId.toString(),
      name,
      tickers,
      createdAt: new Date().toISOString()
    };
    groups.push(newGroup);
    writeStockGroupsFile(groups);
    return newGroup;
  }
}

async function updateStockGroupInDb(userId, groupId, name, tickers) {
  try {
    const client = db.getConnection();
    if (!client || !client.topology || !client.topology.isConnected()) {
      console.warn('MongoDB not connected, using JSON fallback');
      let groups = readStockGroupsFile();
      const index = groups.findIndex(
        g => (g._id === groupId || g._id.toString() === groupId.toString()) && 
             (g.userId === userId || g.userId === userId.toString())
      );
      if (index === -1) return null;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (tickers !== undefined) updateData.tickers = tickers;
      updateData.updatedAt = new Date().toISOString();

      groups[index] = { ...groups[index], ...updateData };
      writeStockGroupsFile(groups);
      return groups[index];
    }

    const collection = client.db('stock_dashboard').collection('stock_groups');
    const updateData = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (tickers !== undefined) updateData.tickers = tickers;

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(groupId), userId: new ObjectId(userId) },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    return result.value;
  } catch (error) {
    console.warn('MongoDB update failed, using JSON fallback:', error.message);
    let groups = readStockGroupsFile();
    const index = groups.findIndex(
      g => (g._id === groupId || g._id.toString() === groupId.toString()) && 
           (g.userId === userId || g.userId === userId.toString())
    );
    if (index === -1) return null;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (tickers !== undefined) updateData.tickers = tickers;
    updateData.updatedAt = new Date().toISOString();

    groups[index] = { ...groups[index], ...updateData };
    writeStockGroupsFile(groups);
    return groups[index];
  }
}

async function deleteStockGroupInDb(userId, groupId) {
  try {
    const client = db.getConnection();
    if (!client || !client.topology || !client.topology.isConnected()) {
      console.warn('MongoDB not connected, using JSON fallback');
      let groups = readStockGroupsFile();
      const initialLength = groups.length;
      groups = groups.filter(
        g => !(g._id === groupId || g._id.toString() === groupId.toString()) || 
             (g.userId !== userId && g.userId !== userId.toString())
      );
      
      if (groups.length === initialLength) return null;
      writeStockGroupsFile(groups);
      return true;
    }

    const collection = client.db('stock_dashboard').collection('stock_groups');
    const result = await collection.deleteOne({
      _id: new ObjectId(groupId),
      userId: new ObjectId(userId)
    });

    return result.deletedCount > 0 ? true : null;
  } catch (error) {
    console.warn('MongoDB delete failed, using JSON fallback:', error.message);
    let groups = readStockGroupsFile();
    const initialLength = groups.length;
    groups = groups.filter(
      g => !(g._id === groupId || g._id.toString() === groupId.toString()) || 
           (g.userId !== userId && g.userId !== userId.toString())
    );

    if (groups.length === initialLength) return null;
    writeStockGroupsFile(groups);
    return true;
  }
}

module.exports = {
  getStockGroupsFromDb,
  createStockGroupInDb,
  updateStockGroupInDb,
  deleteStockGroupInDb
};
