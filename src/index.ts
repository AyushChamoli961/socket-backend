import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import { PollOption, PollQuestion, PrismaClient } from "@prisma/client";

interface PollData{
    title: string;
    createdBy: string;
    questions: {
        text: string;
        options: string[];
    }[];
}

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => {
  res.send("Hello World!");
}
);

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("create-poll", async (pollData: PollData) => {
    console.log("Creating new poll:", pollData);
    try {
      const newPoll = await prisma.poll.create({
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
    } catch (error) {
      console.error("Error creating poll:", error);
      socket.emit("error", "Failed to create poll");
    }
  });



  socket.on("submit-response", async (responseData) => {
    console.log("Submitting response:", responseData);
    try {
      const poll = await prisma.poll.findUnique({
        where: { id: responseData.id, isLive: true },
      });
      console.log("poll", poll)
      if(!poll){
        socket.emit("error", "Poll is not live");
        return;
      }
      const newResponse = await prisma.response.create({
        data: {
          userId: responseData.userId,
          questionId: responseData.questionId,
          optionId: responseData.optionId,
        },
      });
      console.log("New response submitted:", newResponse);

      // Fetch updated results for the poll
      const updatedPoll = await prisma.poll.findUnique({
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
    } catch (error) {
      console.error("Error submitting response:", error);
      socket.emit("error", "Failed to submit response");
    }
  });

  socket.on("get-poll", async (pollId) => {
    console.log("Fetching poll:");
    try {
      const poll = await prisma.poll.findUnique({
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
      } else {
        socket.emit("error", "Poll not found");
      }
    } catch (error) {
      console.error("Error fetching poll:", error);
      socket.emit("error", "Failed to fetch poll");
    }
  });

  socket.on("toggle-poll-status", async (pollId) => {
    try {
      // Fetch the current poll to get the value of 'isLive'
      const poll = await prisma.poll.findUnique({
        where: { id: pollId },
        select: { isLive: true }, // Only get the 'isLive' field
      });

      if (poll) {
        // Toggle the 'isLive' field
        const updatedPoll = await prisma.poll.update({
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
    } catch (error) {
      console.error("Error toggling poll status:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const PORT = 8080;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit();
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
})