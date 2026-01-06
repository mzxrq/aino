const Service = require('./notification-logs.service');

const getAll = async (req, res) => {
  try {
    const items = await Service.getAll();
    return res.status(200).json(items);
  } catch (err) {
    console.error('Get notification logs error', err);
    return res.status(500).json({ error: 'Failed to get notification logs' });
  }
};

const deleteLog = async (req, res) => {
  try {
    const id = req.params.id;
    await Service.deleteOne(id);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Delete notification log error', err);
    return res.status(500).json({ error: 'Failed to delete notification log' });
  }
};

const deleteAll = async (req, res) => {
  try {
    await Service.deleteAll();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Delete all notification logs error', err);
    return res.status(500).json({ error: 'Failed to delete all notification logs' });
  }
};

module.exports = { getAll, deleteLog, deleteAll };
