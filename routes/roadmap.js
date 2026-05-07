const express  = require('express');
const router   = express.Router();
const protect  = require('../middleware/auth');
const {
  generateRoadmap, saveRoadmap,
  getRoadmaps, getRoadmap, deleteRoadmap,
} = require('../controllers/roadmapController');

router.post  ('/generate', protect, generateRoadmap);
router.post  ('/save',     protect, saveRoadmap);
router.get   ('/history',  protect, getRoadmaps);
router.get   ('/:id',      protect, getRoadmap);
router.delete('/:id',      protect, deleteRoadmap);

module.exports = router;