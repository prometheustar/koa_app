/**
 * 加密解密工具方法
 */

const NodeRSA = require('node-rsa')
const bcrypt = require('bcryptjs')


/**
 * bcryrpt同步加密密码
 * @param {要加密的密码} password 
 */
const enbcrypt = (password) => {
	var salt = bcrypt.genSaltSync(10)
	var hash = bcrypt.hashSync(password, salt)
	return hash
}

/**
 * 生成 RSA 公钥和私钥
 */
const RSAKeyPair = function() {
    const key = new NodeRSA({b: 1024}, 'base64', { encryptionScheme: 'pkcs1' })
    this.private =  key.exportKey('private')
    this.public =  key.exportKey('public')
}

/**
 * 解密公钥加密的数据
 * @param {公钥加密的数据} encrypted 
 * @param {公钥对应的私钥} privateKey 
 */
const decryptRSAPublic = (encrypted, privateKey) => {
    // 生成一个空键
    const key = new NodeRSA(null, 'base64', { encryptionScheme: 'pkcs1' })
    key.importKey(privateKey, 'pkcs1')
    try {
        return key.decrypt(encrypted, 'utf8')
    }catch(e) {
        return null
    }
}

module.exports = {
    enbcrypt,
    RSAKeyPair,
    decryptRSAPublic
}