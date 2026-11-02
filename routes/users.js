var express = require('express');
var router = express.Router();
var User = require('../models/user');
var mongoose = require('mongoose');
var Task = require('../models/task');
const req = require('express/lib/request');
const task = require('../models/task');

function isValidId(id) {
    return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}
router.delete('/:id', async function (req, res) {
    try {
        var userId = req.params.id;
        if (!isValidId(userId)) {
            return res.status(404).json({
                message: 'User not found.',
                data: null
            });
        }
        var user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                message: 'User not found.',
                data: null
            });
        }
        await Task.updateMany(
            { assignedUser: userId },//match on user id
            { assignedUser: '', assignedUserName: 'unassigned' }//set all matches to this
        );
        await User.findByIdAndDelete(userId);
        return res.status(204).send();
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: 'Could not delete user.',
            data: null
        });
    }
});

router.get('/', async (req, res) => {
    try {
        var where = req.query.where ? JSON.parse(req.query.where) : {};
        var sort = req.query.sort ? JSON.parse(req.query.sort) : {};
        var select = req.query.select ? JSON.parse(req.query.select) : {};
        var skip = req.query.skip === undefined ? 0 : Number(req.query.skip);
        var limit = req.query.limit === undefined ? 0 : Number(req.query.limit);
        var count = req.query.count === 'true';
        if (!Number.isInteger(skip) || !Number.isInteger(limit) || skip < 0 || limit < 0) {
            return res.status(400).json({
                message: 'Invalid skip or limit.',
                data: null
            });
        }
        let query = User.find(where);
        query = query.sort(sort);
        query = query.select(select);
        query = query.skip(skip).limit(limit);
        if (count) {
            var n = await User.countDocuments(where);
            return res.status(200).json({
                message: 'Success',
                data: n
            });
        }
        var users = await query;
        return res.status(200).json({
            message: 'Success',
            data: users
        });
    } catch (err) {
        if (err.name === 'CastError' || err instanceof SyntaxError) {
            return res.status(400).json({
                message: 'Invalid value in query.',
                data: null
            });
        }
        console.error(err);
        return res.status(500).json({
            message: 'Could not get users.',
            data: null
        });
    }
});

router.get('/:id', async function (req, res) {
    try {
        var userId = req.params.id;
        if (!isValidId(userId)) {
            return res.status(404).json({
                message: 'User not found.',
                data: null
            });
        }
        var select = req.query.select ? JSON.parse(req.query.select) : {};
        var user = await User.findById(userId).select(select);
        if (!user) {
            return res.status(404).json({
                message: 'User not found.',
                data: null
            });
        }
        return res.status(200).json({
            message: 'OK',
            data: user
        });
    } catch (err) {
        if (err instanceof SyntaxError) {
            return res.status(400).json({
                message: 'Invalid select parameter.',
                data: null
            });
        }
        console.error(err);
        return res.status(500).json({
            message: 'Could not get user.',
            data: null
        });
    }
});

router.post('/', async function (req, res) {

    try {
        var name = req.body.name;
        var email = req.body.email;
        if (!name || typeof name !== 'string' || !email || typeof email !== 'string') {
            return res.status(400).json({
                message: 'Need name and email.',
                data: null
            });
        }
        name = name.trim();
        email = email.trim();
        if (name === '' || email === '') {
            return res.status(400).json({
                message: 'Name and email cannot be empty.',
                data: null
            });
        }

        var pendingTasks = req.body.pendingTasks === undefined ? [] : req.body.pendingTasks;

        if (!Array.isArray(pendingTasks)) {
            return res.status(400).json({
                message: 'pendingTasks must be an array.',
                data: null
            });
        }
        for (var id of pendingTasks) {
            if (!isValidId(id)) {
                return res.status(400).json({
                    message: 'A task id in pendingTasks is not a valid id format.',
                    data: null
                });
            }
        }
        var pendingTasksDup = Array.from(new Set(pendingTasks));
        var tasks = [];
        if (pendingTasksDup.length > 0) {
            tasks = await Task.find({ _id: { $in: pendingTasksDup } });
            if (tasks.length !== pendingTasksDup.length) {
                return res.status(404).json({
                    message: 'Task not found.',
                    data: null
                });
            }
            if (tasks.some(task => task.completed)) {
                return res.status(400).json({
                    message: 'Completed tasks should not be in pendingTasks.',
                    data: null
                });
            }
        }

        // Create user
        var user = new User({
            name: name,
            email: email,
            pendingTasks: pendingTasksDup,
            dateCreated: Date.now()
        });
        await user.save();

        if (pendingTasksDup.length > 0) {
            // Remove tasks from their old owners 
            for (var task of tasks) {
                if (task.assignedUser !== '') {
                    var oldUser = await User.findById(task.assignedUser);

                    if (oldUser) {
                        oldUser.pendingTasks.pull(task._id.toString());
                        await oldUser.save();
                    }
                }
                task.assignedUser = user._id.toString();
                task.assignedUserName = user.name;
                await task.save();
            }
        }
        return res.status(201).json({
            message: 'success',
            data: user
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({
                message: 'Email already used by another user',
                data: null
            });
        }
        if (err.name === 'ValidationError' || err.name === 'CastError') {
            return res.status(400).json({
                message: 'Invalid user data.',
                data: null
            });
        }
        console.error(err);
        return res.status(500).json({
            message: 'Internal server error.',
            data: null
        });
    }
});

router.put('/:id', async (req, res) => {
    try { 
        var userId = req.params.id;
        if (!isValidId(userId)) {
            return res.status(404).json({
                message: 'Invalid Id.',
                data: null
            });
        }
        var user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                message: 'User not found.',
                data: null
            });
        }
        var pendingTasks = req.body.pendingTasks === undefined ? [] : req.body.pendingTasks;
        var name = req.body.name;
        var email = req.body.email;
        if (typeof name !== 'string' ||
        name.trim() === '' ||
        typeof email !== 'string' ||
        email.trim() === '') {
        return res.status(400).json({
            message: 'Invalid user data.',
            data: null
        });
        }if (!Array.isArray(pendingTasks)) {
            return res.status(400).json({
                message: 'pendingTasks must be an array.',
                data: null
            });
        }
        name = name.trim();
        email = email.trim();
        var existingUser = await User.findOne({
            email: email,
            _id: { $ne: userId }
        });
        if (existingUser) {
            return res.status(400).json({
                message: 'Email already used by another user.',
                data: null
            });
        }
        for (var id of pendingTasks) {
            if (!isValidId(id)) {
                return res.status(400).json({
                    message: 'Invalid task ID',
                    data: null
                });
            }
        }
        var pendingTasksDup = Array.from(new Set(pendingTasks));
        var tasks = [];
        if (pendingTasksDup.length > 0) {
            tasks = await Task.find({
                _id: { $in: pendingTasksDup }
            });

            if (tasks.length !== pendingTasksDup.length) {
                return res.status(400).json({
                    message: 'Task not found.',
                    data: null
                });
            }
            if (tasks.some(task => task.completed)) {
                return res.status(400).json({
                    message: 'Completed tasks cannot be in pendingTasks.',
                    data: null
                });
            }
        }  
        var oldTasks = user.pendingTasks.map(id => id.toString());
        var newTasks = pendingTasksDup;
        for (var id of oldTasks) { // in old but not in new
            if (!newTasks.includes(id)) {
                var changedTask = await Task.findById(id);
        
                if (changedTask && changedTask.assignedUser === userId) {
                    changedTask.assignedUser = '';
                    changedTask.assignedUserName = 'unassigned';
                    await changedTask.save();
                }
            }
        }
        for (var id of newTasks) { //in new but not in old
            if (!oldTasks.includes(id)) {
                var changedTask = await Task.findById(id);
        
                if (changedTask) {
                    if (changedTask.assignedUser !== '') {
                        var oldUser = await User.findById(changedTask.assignedUser);
        
                        if (oldUser) {
                            oldUser.pendingTasks.pull(id);
                            await oldUser.save();
                        }
                    }
        
                    changedTask.assignedUser = userId;
                    changedTask.assignedUserName = name;
                    await changedTask.save();
                }
            }
        }
        for (var id of newTasks) {
            if (oldTasks.includes(id)) {
                var changedTask = await Task.findById(id);
                changedTask.assignedUserName = name;
                await changedTask.save();
            }
        }
        var completedTasks = await Task.find({
            assignedUser: userId,
            completed: true
        });
        
        for (var task of completedTasks) {
            task.assignedUserName = name;
            await task.save();
        }
        user.name = name;
        user.email = email;
        user.pendingTasks = newTasks;

        await user.save();

        return res.status(200).json({
            message: 'Success',
            data: user
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({
                message: 'Email already used by another user.',
                data: null
            });
        }
        if (err.name === 'ValidationError' || err.name === 'CastError') {
            return res.status(400).json({
                message: 'Invalid user data.',
                data: null
            });
        }
        console.error(err);
        return res.status(500).json({
            message: 'Could not update user.',
            data: null
        });
    }
});

module.exports = router;