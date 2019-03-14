const db = require('../../config/mysqldb')
const fs = require('fs')

module.exports.saveChatFile = (ws, buffer) => {
	try {
		
	}catch(err) {

	}
	console.log(buffer)
	console.log(ws._sender._socket.filename)
}

// 客户端发送消息
module.exports.sendChatMessage = async (ws, info, wss) => {
	if (ws._sender._socket.token.userId !== info.origin || !/^[1-9]\d*$/.test(info.origin) || !/^[1-9]\d*$/.test(info.target) || info.content === undefined || info.content === '') { return }
	try {
		const result = await db.executeNoQuery(`insert into tb_chat(sender,receiver,content) values(${info.origin},${info.target},'${info.content}');`)
		if (result < 1) return; // 消息插入失败，未知异常
		ws.send(JSON.stringify(info))
		const target = wss.isOnline(info.target)
		if (target) {
			info.type = 'receive_chat_message'
			info.nickname = ws._sender._socket.token.nickname
			info.avatar = ws._sender._socket.token.avatar
			target.send(JSON.stringify(info))
		}
	}catch(err) {
		console.error('/ws/chat/send_chat_message', err.message)
	}
}