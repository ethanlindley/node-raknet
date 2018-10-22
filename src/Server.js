"use strict"

const BitStream = require("./utils/BitStream")
const ReliabilityLayer = require("./ReliabilityLayer")
const Messages = require("./Messages")

const EventEmitter = require("events")

class Server extends EventEmitter {
  constructor(ip = "127.0.0.1", port = 1001, password) {
    super()

    this.ip = ip
    this.port = port
    this.password = password

    this.clients = []

    this.server = require("dgram").createSocket("udp4")
    this.logger = require("./utils/Logger")

    this.startListeners()
  }

  /**
   * Starts all the listeners
   */
  startListeners() {
    this.server.on("message", (message, recipient) => {
      const stream = new BitStream(message)

      try {
        this.handleOnMessage(stream, recipient)
      } catch (e) {
        this.logger.error(e.message)
        this.logger.error(e.stack)
      }
    })

    this.server.on("error", (err) => {
      this.logger.error(err)
    })

    this.server.on("listening", () => {
      const addr = this.server.address()

      this.logger.info(`RakNetJS listening on ${addr.address}:${addr.port}`)
    })

    this.server.bind(this.port, this.ip)
  }

  /**
   * This is called when we receive a new message from a client
   * @param {BitStream} stream
   * @param {Object} recipient
   */
  handleOnMessage(stream, recipient) {
    if (stream.length() === 2) {
      if (stream.readByte() === Messages.ID_OPEN_CONNECTION_REQUEST) {
        this.logger.info(`${recipient.address}:${recipient.port} has connected`)

        this.clients[recipient.address] = new ReliabilityLayer(this.server, recipient)

        this.server.send(
          Buffer.from([Messages.ID_OPEN_CONNECTION_REPLY]),
          recipient.port,
          recipient.address
        )
      }
    } else {
      if (this.clients[recipient.address] !== undefined) {
        const packets = this.clients[recipient.address].handleData(stream)
        let isFinished = false

        while (!isFinished) {
          const next = packets.next()

          if (next.value !== undefined) {
            const packetType = next.value.readByte()

            if (this.listenerCount(String(packetType)) > 0) {
              this.emit(String(packetType), next.value, recipient)
            } else {
              this.logger.warn(
                `No listener found for packet ID ${packetType}. Did you add any event listeners?`
              )
            }
          }

          if (next.done) {
            isFinished = true
          }
        }
      } else {
        this.logger.warn("An unconnected client sent us a message")
      }
    }
  }

  getClientByIP(ip) {
    return this.clients[ip]
  }
}

module.exports = Server
