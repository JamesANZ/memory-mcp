#!/usr/bin/env node

import { ConversationOrchestrator } from "./orchestrator.js";
import { connect } from "./db.js";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

class ConversationCLI {
  private orchestrator: ConversationOrchestrator;
  private currentConversationId: string = "demo-conversation";
  private llm: string = "claude";

  constructor() {
    this.orchestrator = new ConversationOrchestrator(4000); // Smaller limit for demo
  }

  async start() {
    console.log("🧠 Memory MCP Conversation Orchestrator");
    console.log("========================================\n");

    await connect();
    console.log("✅ Connected to database\n");

    this.showHelp();
    this.promptUser();
  }

  private showHelp() {
    console.log("Available commands:");
    console.log("  add <message>     - Add a message to the conversation");
    console.log(
      "  status            - Show conversation status and recommendations",
    );
    console.log("  archive           - Manually trigger archiving");
    console.log("  retrieve          - Manually trigger retrieval");
    console.log("  summary <text>    - Create a summary of archived content");
    console.log("  list              - List all active conversations");
    console.log("  switch <id>       - Switch to a different conversation");
    console.log("  help              - Show this help");
    console.log("  quit              - Exit the application");
    console.log("");
  }

  private promptUser() {
    rl.question(`[${this.currentConversationId}] > `, async (input) => {
      const parts = input.trim().split(" ");
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      try {
        switch (command) {
          case "add":
            await this.handleAdd(args.join(" "));
            break;
          case "status":
            await this.handleStatus();
            break;
          case "archive":
            await this.handleArchive();
            break;
          case "retrieve":
            await this.handleRetrieve();
            break;
          case "summary":
            await this.handleSummary(args.join(" "));
            break;
          case "list":
            await this.handleList();
            break;
          case "switch":
            await this.handleSwitch(args[0]);
            break;
          case "help":
            this.showHelp();
            break;
          case "quit":
          case "exit":
            console.log("👋 Goodbye!");
            rl.close();
            return;
          default:
            console.log(
              "❌ Unknown command. Type 'help' for available commands.",
            );
        }
      } catch (error: any) {
        console.error("❌ Error:", error.message);
      }

      this.promptUser();
    });
  }

  private async handleAdd(message: string) {
    if (!message) {
      console.log("❌ Please provide a message to add");
      return;
    }

    console.log(`📝 Adding message: "${message}"`);

    const result = await this.orchestrator.addMessage(
      this.currentConversationId,
      message,
      this.llm,
    );

    console.log(
      `📊 Context usage: ${result.state.totalWordCount}/${result.state.maxWordCount} words`,
    );

    if (result.archiveDecision?.shouldArchive) {
      console.log(`🔄 ${result.archiveDecision.reason}`);
      console.log(
        `📦 Archiving ${result.archiveDecision.messagesToArchive.length} messages with tags: ${result.archiveDecision.tags.join(", ")}`,
      );

      await this.orchestrator.executeArchive(
        result.archiveDecision,
        result.state,
      );
    }

    if (result.retrievalDecision?.shouldRetrieve) {
      console.log(`🔍 ${result.retrievalDecision.reason}`);
      console.log(
        `📥 Retrieving ${result.retrievalDecision.contextToRetrieve.length} relevant items`,
      );

      await this.orchestrator.executeRetrieval(
        result.retrievalDecision,
        result.state,
      );
    }
  }

  private async handleStatus() {
    const status = await this.orchestrator.getConversationStatus(
      this.currentConversationId,
    );
    const usageRatio = status.state.totalWordCount / status.state.maxWordCount;

    console.log(`\n📊 Conversation Status: ${this.currentConversationId}`);
    console.log(
      `   Current context: ${status.state.currentContext.length} messages`,
    );
    console.log(
      `   Word count: ${status.state.totalWordCount}/${status.state.maxWordCount} (${(usageRatio * 100).toFixed(1)}%)`,
    );
    console.log(`   LLM: ${status.state.llm}`);

    if (status.recommendations.length > 0) {
      console.log("\n💡 Recommendations:");
      status.recommendations.forEach((rec) => console.log(`   ${rec}`));
    }

    console.log("");
  }

  private async handleArchive() {
    const state = await this.orchestrator.initializeConversation(
      this.currentConversationId,
      this.llm,
    );
    const decision = await this.orchestrator["shouldArchive"](state);

    if (decision.shouldArchive) {
      console.log(`🔄 ${decision.reason}`);
      await this.orchestrator.executeArchive(decision, state);
    } else {
      console.log("ℹ️ No archiving needed at this time");
    }
  }

  private async handleRetrieve() {
    const state = await this.orchestrator.initializeConversation(
      this.currentConversationId,
      this.llm,
    );
    const decision = await this.orchestrator["shouldRetrieve"](state);

    if (decision.shouldRetrieve) {
      console.log(`🔍 ${decision.reason}`);
      await this.orchestrator.executeRetrieval(decision, state);
    } else {
      console.log("ℹ️ No retrieval needed at this time");
    }
  }

  private async handleSummary(summaryText: string) {
    if (!summaryText) {
      console.log("❌ Please provide summary text");
      return;
    }

    try {
      await this.orchestrator.createSummary(
        this.currentConversationId,
        summaryText,
        this.llm,
      );
      console.log("✅ Summary created successfully");
    } catch (error: any) {
      console.error("❌ Failed to create summary:", error.message);
    }
  }

  private async handleList() {
    const conversations = this.orchestrator.getActiveConversations();
    if (conversations.length === 0) {
      console.log("📝 No active conversations");
    } else {
      console.log("📝 Active conversations:");
      conversations.forEach((id) => {
        const marker = id === this.currentConversationId ? "→ " : "  ";
        console.log(`${marker}${id}`);
      });
    }
  }

  private async handleSwitch(conversationId: string) {
    if (!conversationId) {
      console.log("❌ Please provide a conversation ID");
      return;
    }

    this.currentConversationId = conversationId;
    await this.orchestrator.initializeConversation(conversationId, this.llm);
    console.log(`🔄 Switched to conversation: ${conversationId}`);
  }
}

// Start the CLI
const cli = new ConversationCLI();
cli.start().catch(console.error);
