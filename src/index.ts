import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import { PollOption, PollQuestion, PrismaClient } from "@prisma/client";
import { Gender } from "@prisma/client";
interface PollData {
  title: string;
  createdBy: string;
  college: string;
  gender: Gender;
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
          college: pollData.college,
          createdBy: pollData.createdBy,
          forGender: pollData.gender,
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
  
  socket.on("check-status", async(questionId, userId) => {
    try {
      const response = await prisma.response.findFirst({
        where: {
          questionId,
          userId,
        },
      });
      if (response) {
        socket.emit("error", "Response already exists");
        socket.emit("response-exists", response);
      } else {
        socket.emit("response-not-found");
      }
    }
    catch(error){
      console.log(error)
    }
})

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
  
  socket.on("delete-response", async ({ userId, questionId }) => {
    try {
      // Delete the previous response based on userId and questionId
      await prisma.response.deleteMany({
        where: {
          userId,
          questionId,
        },
      });
    } catch (error) {
      console.error("Error deleting response:", error);
      socket.emit("error", "Failed to delete the previous response.");
    }
  });


});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit();
});

