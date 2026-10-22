export interface ChatSessionState {
  activeConversationId: string | null;
  model: string;
  memoryEnabled: boolean;
  responseStyle: "concise" | "balanced" | "detailed";
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** Extracted text content when the file is text-based. */
  textContent?: string;
}

export interface GeneratedImage {
  id: string;
  prompt: string;
  /** data URI or remote URL */
  url: string;
  model: string;
  createdAt: number;
}
