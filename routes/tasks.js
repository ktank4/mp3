var express = require('express');
var router = express.Router();
var Task = require('../models/task');
var User = require('../models/user');
const task = require('../models/task');

function isValidId(id) {
    return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}
router.delete('/:id', async (req, res) => {
    try {
        var taskId = req.params.id;
        if (!isValidId(taskId)) {
            return res.status(404).json({
                message: 'Task not found.',
                data: null
            });
        }
        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({
                message: 'Task not found.',
                data: null
            });
        }
        if (task.assignedUser !== '') {
            var user = await User.findById(task.assignedUser);

            if (user) {
                user.pendingTasks.pull(taskId);
                await user.save();
            }
        }
        await Task.findByIdAndDelete(taskId);
        return res.status(200).json({
            message: 'Success.',
            data: task
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: 'Could not delete task.',
            data: null
        });
    }
});

router.get('/', async (req, res) => {
    try {
        var where = req.query.where ? JSON.parse(req.query.where) : {};
        var sort = req.query.sort ? JSON.parse(req.query.sort) : {};
        var select = req.query.select ? JSON.parse(req.query.select) : {};
        var skip = Number(req.query.skip) || 0;
        var limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
        var count = req.query.count === 'true';
        if (isNaN(skip) || isNaN(limit) || skip < 0 || limit < 0) {
            return res.status(400).json({
                message: 'Invalid skip or limit.',
                data: null
            });
        }
        let query = Task.find(where);
        query = query.sort(sort);
        query = query.select(select);
        query = query.skip(skip).limit(limit);
        if (count) {
            var n = await Task.countDocuments(where);
            return res.status(200).json({
                message: 'Success',
                data: n
            });
        }
        var tasks = await query;
        return res.status(200).json({
            message: 'Success',
            data: tasks
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
            message: 'Could not get tasks.',
            data: null
        });
    }
});

router.get('/:id', async function (req, res) {
    try {
        var taskId = req.params.id;
        if (!isValidId(taskId)) {
            return res.status(404).json({
                message: 'Task not found.',
                data: null
            });
        }
        var select = req.query.select ? JSON.parse(req.query.select) : {};
        var task = await Task.findById(taskId).select(select);
        if (!task) {
            return res.status(404).json({
                message: 'Task not found.',
                data: null
            });
        }
        return res.status(200).json({
            message: 'OK',
            data: task
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
            message: 'Could not get task.',
            data: null
        });
    }
});

router.put('/:id', async (req, res) => {
    try { 
        var taskId = req.params.id;
        if (!isValidId(taskId)) {
            return res.status(404).json({
                message: 'Task not found.',
                data: null
            });
        }
        var task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({
                message: 'Task not found.',
                data: null
            });
        }
        var oldUserId = task.assignedUser;
        var newUserId = req.body.assignedUser || '';
        var completed = req.body.completed === undefined ? false : req.body.completed;
        var name = req.body.name;
        var description = req.body.description === undefined? '': req.body.description;
        var parsed = new Date(req.body.deadline)
        if (typeof name !== 'string' ||
            name.trim() === '' ||
            !req.body.deadline ||
            isNaN(parsed.getTime()) ||
            typeof completed !== 'boolean' ||
            typeof description !== 'string' ||
            typeof newUserId !== 'string') 
        {
        return res.status(400).json({
            message: 'Invalid task data.',
            data: null
        });
    }
    var newUserProfile = null;
    if (newUserId != ''){
        if (!isValidId(newUserId)) {
            return res.status(400).json({
                message: 'Invalid user.',
                data: null
            });
        }
        var newUserProfile = await User.findById(newUserId);
        if (!newUserProfile) {
            return res.status(404).json({
                message: 'User not found.',
                data: null
            });
        }
    }
    var newUserId = req.body.assignedUser || '';
var newUserName = req.body.assignedUserName;

if (newUserId !== '') {
    if (!isValidId(newUserId)) {
        return res.status(400).json({ message: 'Invalid assignedUser.', data: null });
    }
    var newUserProfile = await User.findById(newUserId);
    if (!newUserProfile) {
        return res.status(400).json({ message: 'Assigned user not found.', data: null });
    }
    if (newUserName !== undefined && newUserName !== newUserProfile.name) {
        return res.status(400).json({
            message: 'assignedUserName does not match assignedUser.',
            data: null
        });
    }
    newUserName = newUserProfile.name;
} else {
    if (newUserName !== undefined && newUserName !== 'unassigned') {
        return res.status(400).json({
            message: 'assignedUserName must be "unassigned" when assignedUser is empty.',
            data: null
        });
    }
    newUserName = 'unassigned';
}

// ...then your oldUserProfile block...
    var oldUserProfile = null;

    if (oldUserId !== '') {
        oldUserProfile = await User.findById(oldUserId);
    }
    if (oldUserProfile && (oldUserId !== newUserId || completed)) {
        oldUserProfile.pendingTasks.pull(taskId);
        await oldUserProfile.save();
    }

    if (newUserProfile) {
        if (completed) {
            newUserProfile.pendingTasks.pull(taskId);
        } else {
            newUserProfile.pendingTasks.addToSet(taskId);
        }

        await newUserProfile.save();
    }

    task.name = name.trim();
    task.description = description;
    task.deadline = parsed;
    task.completed = completed;
    task.assignedUser = newUserId;
    if (newUserProfile) {
        task.assignedUserName = newUserProfile.name;
    } else {
        task.assignedUserName = 'unassigned';
    }

    await task.save();
    return res.status(200).json({
        message: 'Success',
        data: task
    });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: 'Could not update task.',
            data: null
        });
}
});

router.post('/', async function (req, res) {
    try {
        var name = req.body.name;
        var description = req.body.description || '';
        var deadline = req.body.deadline;
        var parsed = new Date(deadline);
        var completed = req.body.completed === undefined ? false : req.body.completed;
        var assignedUser = req.body.assignedUser || '';
        var assignedUserName = 'unassigned';
        var user = null;
        if (typeof name !== 'string' ||
            name.trim() === '' ||
            deadline === undefined || deadline === null || deadline === '' ||
            isNaN(parsed.getTime()) ||
            typeof completed !== 'boolean' ||
            typeof description !== 'string' ||
            typeof assignedUser !== 'string'
        ) {
            return res.status(400).json({
                message: 'Invalid task data.',
                data: null
            });
        }
        if (assignedUser !== '') {
            if (!isValidId(assignedUser)) {
                return res.status(400).json({
                    message: 'Invalid userID.',
                    data: null
                });
            }
            user = await User.findById(assignedUser);
            if (!user) {
                return res.status(404).json({
                    message: 'User not found.',
                    data: null
                });
            }
            if (req.body.assignedUserName !== undefined && req.body.assignedUserName !== user.name) {
                return res.status(400).json({
                    message: 'Assigned username does not match the user.',
                    data: null
                });
            }
        assignedUserName = user.name;
        }
        // Create the task
        var task = new Task({
            name: name.trim(),
            description: description,
            deadline: parsed,
            completed: completed,
            assignedUser: assignedUser,
            assignedUserName: assignedUserName,
            dateCreated: new Date()
        });
        await task.save();
        // Add pending tasks to the assigned user list  
        if (user !== null && completed === false) {
            user.pendingTasks.addToSet(task._id.toString());
            await user.save();
        }
        res.status(201).json({
            message: 'Success',
            data: task
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: 'Could not create task.',
            data: null
        });
    }
});



module.exports = router;
