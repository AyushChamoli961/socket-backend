"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
    },
});
app.get("/", (req, res) => {
    res.send("Hello World!");
});
io.on("connection", (socket) => {
    console.log("A user connected");
    socket.on("create-poll", (pollData) => __awaiter(void 0, void 0, void 0, function* () {
        console.log("Creating new poll:", pollData);
        try {
            const newPoll = yield prisma.poll.create({
                data: {
                    title: pollData.title,
                    createdBy: pollData.createdBy,
                    pollQuestion: {
                        create: pollData.questions.map((q) => ({
                            text: q.text,
                            pollOption: {
                                create: q.options.map((opt) => ({
                                    text: opt, // Ensure `pollOption` exists and has a `text` property
                                })),
                            },
                        })),
                    },
                },
                include: {
                    pollQuestion: {
                        include: {
                            pollOption: true,
                        },
                    },
                },
            });
            console.log("New poll created:", newPoll);
            io.emit("new-poll", newPoll);
        }
        catch (error) {
            console.error("Error creating poll:", error);
            socket.emit("error", "Failed to create poll");
        }
    }));
    socket.on("submit-response", (responseData) => __awaiter(void 0, void 0, void 0, function* () {
        console.log("Submitting response:", responseData);
        try {
            const poll = yield prisma.poll.findUnique({
                where: { id: responseData.id, isLive: true },
            });
            console.log("poll", poll);
            if (!poll) {
                socket.emit("error", "Poll is not live");
                return;
            }
            const newResponse = yield prisma.response.create({
                data: {
                    userId: responseData.userId,
                    questionId: responseData.questionId,
                    optionId: responseData.optionId,
                },
            });
            console.log("New response submitted:", newResponse);
            // Fetch updated results for the poll
            const updatedPoll = yield prisma.poll.findUnique({
                where: { id: responseData.id },
                include: {
                    pollQuestion: {
                        include: {
                            pollOption: {
                                include: {
                                    _count: {
                                        select: { Response: true },
                                    },
                                },
                            },
                        },
                    },
                },
            });
            io.emit("update-poll-results", updatedPoll);
        }
        catch (error) {
            console.error("Error submitting response:", error);
            socket.emit("error", "Failed to submit response");
        }
    }));
    socket.on("get-poll", (pollId) => __awaiter(void 0, void 0, void 0, function* () {
        console.log("Fetching poll:");
        try {
            const poll = yield prisma.poll.findUnique({
                where: { id: pollId },
                include: {
                    pollQuestion: {
                        include: {
                            pollOption: {
                                include: {
                                    _count: {
                                        select: { Response: true },
                                    },
                                },
                            },
                        },
                    },
                },
            });
            if (poll) {
                socket.emit("poll-data", poll);
            }
            else {
                socket.emit("error", "Poll not found");
            }
        }
        catch (error) {
            console.error("Error fetching poll:", error);
            socket.emit("error", "Failed to fetch poll");
        }
    }));
    socket.on("toggle-poll-status", (pollId) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            // Fetch the current poll to get the value of 'isLive'
            const poll = yield prisma.poll.findUnique({
                where: { id: pollId },
                select: { isLive: true }, // Only get the 'isLive' field
            });
            if (poll) {
                // Toggle the 'isLive' field
                const updatedPoll = yield prisma.poll.update({
                    where: { id: pollId },
                    data: {
                        isLive: !poll.isLive, // Toggle the current value
                    },
                    include: {
                        pollQuestion: {
                            include: {
                                pollOption: {
                                    include: {
                                        _count: {
                                            select: { Response: true },
                                        },
                                    }
                                },
                            },
                        },
                    },
                });
                // Do something with the updatedPoll
                console.log(updatedPoll);
                socket.emit("poll-data", updatedPoll);
            }
        }
        catch (error) {
            console.error("Error toggling poll status:", error);
        }
    }));
    socket.on("disconnect", () => {
        console.log("User disconnected");
    });
});
const PORT = 8080;
httpServer.listen(PORT, () => {
    console.log(`Socket.IO server running on port ${PORT}`);
});
// Graceful shutdown
process.on("SIGINT", () => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
    process.exit();
}));
app.listen(3000, () => {
    console.log("Server running on port 3000");
});
