const {
  getStockGroupsFromDb,
  createStockGroupInDb,
  updateStockGroupInDb,
  deleteStockGroupInDb
} = require('../services/stockGroupsService');

async function getAllStockGroups(req, res) {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const groups = await getStockGroupsFromDb(userId);
    return res.status(200).json(groups || []);
  } catch (error) {
    console.error('Error fetching stock groups:', error);
    return res.status(500).json({ message: error.message || 'Failed to fetch stock groups' });
  }
}

async function createStockGroup(req, res) {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { name, tickers } = req.body;

    if (!name || !tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ message: 'Name and non-empty tickers array are required' });
    }

    if (name.length > 50) {
      return res.status(400).json({ message: 'Group name must be 50 characters or less' });
    }

    const group = await createStockGroupInDb(userId, name, tickers);
    return res.status(201).json(group);
  } catch (error) {
    console.error('Error creating stock group:', error);
    return res.status(500).json({ message: error.message || 'Failed to create stock group' });
  }
}

async function updateStockGroup(req, res) {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { groupId } = req.params;
    const { name, tickers } = req.body;

    if (!name && !tickers) {
      return res.status(400).json({ message: 'At least one of name or tickers is required' });
    }

    if (name && name.length > 50) {
      return res.status(400).json({ message: 'Group name must be 50 characters or less' });
    }

    if (tickers && (!Array.isArray(tickers) || tickers.length === 0)) {
      return res.status(400).json({ message: 'Tickers must be a non-empty array' });
    }

    const group = await updateStockGroupInDb(userId, groupId, name, tickers);
    if (!group) {
      return res.status(404).json({ message: 'Stock group not found' });
    }

    return res.status(200).json(group);
  } catch (error) {
    console.error('Error updating stock group:', error);
    return res.status(500).json({ message: error.message || 'Failed to update stock group' });
  }
}

async function deleteStockGroup(req, res) {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { groupId } = req.params;

    const result = await deleteStockGroupInDb(userId, groupId);
    if (!result) {
      return res.status(404).json({ message: 'Stock group not found' });
    }

    return res.status(200).json({ message: 'Stock group deleted successfully' });
  } catch (error) {
    console.error('Error deleting stock group:', error);
    return res.status(500).json({ message: error.message || 'Failed to delete stock group' });
  }
}

module.exports = {
  getAllStockGroups,
  createStockGroup,
  updateStockGroup,
  deleteStockGroup
};
