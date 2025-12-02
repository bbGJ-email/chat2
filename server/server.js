// 后端服务器代码
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 获取当前文件和目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 创建Express应用
const app = express();

// 创建HTTP服务器
const server = http.createServer(app);

// 配置Socket.io服务器
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// 配置静态文件服务
app.use(express.static(join(__dirname, '../public')));

// 根路由，提供index.html
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, '../public', 'index.html'));
});

// 在线用户列表
let onlineUsers = {};

// Socket.io事件处理
io.on('connection', (socket) => {
    console.log('新用户连接:', socket.id);
    
    // 用户加入事件
    socket.on('user-join', (data) => {
        // 检查昵称是否已存在
        const nicknameExists = Object.values(onlineUsers).some(user => 
            user.nickname === data.nickname && user.id !== socket.id
        );
        
        if (nicknameExists) {
            // 如果昵称已存在，添加数字后缀
            let counter = 1;
            let newNickname = `${data.nickname}(${counter})`;
            
            while (Object.values(onlineUsers).some(user => user.nickname === newNickname)) {
                counter++;
                newNickname = `${data.nickname}(${counter})`;
            }
            
            data.nickname = newNickname;
        }
        
        // 存储用户信息
        onlineUsers[socket.id] = {
            id: socket.id,
            nickname: data.nickname,
            joinedAt: new Date().toISOString()
        };
        
        // 向新用户发送当前在线用户列表
        const userList = Object.values(onlineUsers).map(user => user.nickname);
        socket.emit('update-users', userList);
        
        // 广播用户加入消息给其他用户
        socket.broadcast.emit('user-joined', {
            nickname: data.nickname
        });
        
        // 广播更新后的用户列表
        socket.broadcast.emit('update-users', userList);
        
        console.log(`${data.nickname} 加入了聊天室`);
    });
    
    // 接收和转发消息
    socket.on('send-message', (message) => {
        console.log(`接收到消息: ${message.nickname}: ${message.text}`);
        
        // 广播消息给所有客户端
        io.emit('new-message', message);
    });
    
    // 接收和转发私聊消息
    socket.on('send-private-message', (message) => {
        console.log(`接收到私聊消息: ${message.sender} -> ${message.receiver}: ${message.text}`);
        
        // 查找接收者的socket ID
        const receiverSocketId = Object.keys(onlineUsers).find(id => onlineUsers[id].nickname === message.receiver);
        
        if (receiverSocketId) {
            // 发送给接收者
            io.to(receiverSocketId).emit('new-private-message', message);
            // 发送给发送者（确认消息已发送）
            socket.emit('new-private-message', message);
        } else {
            // 如果接收者不在线，通知发送者
            socket.emit('private-message-error', {
                receiver: message.receiver,
                error: '接收者当前不在线'
            });
        }
    });
    
    // 用户离开事件
    function handleUserDisconnect() {
        const user = onlineUsers[socket.id];
        
        if (user) {
            // 删除用户信息
            delete onlineUsers[socket.id];
            
            // 获取更新后的用户列表
            const userList = Object.values(onlineUsers).map(user => user.nickname);
            
            // 广播用户离开消息
            io.emit('user-left', {
                nickname: user.nickname
            });
            
            // 广播更新后的用户列表
            io.emit('update-users', userList);
            
            console.log(`${user.nickname} 离开了聊天室`);
        }
    }
    
    // 监听断开连接事件
    socket.on('disconnect', () => {
        console.log('用户断开连接:', socket.id);
        handleUserDisconnect();
    });
    
    // 监听用户主动离开
    socket.on('user-leave', () => {
        handleUserDisconnect();
    });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('服务器发生错误');
});

// 404处理
app.use((req, res, next) => {
    res.status(404).sendFile(join(__dirname, '../public', 'index.html'));
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});

// 处理服务器关闭
process.on('SIGINT', () => {
    console.log('服务器正在关闭...');
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });
});