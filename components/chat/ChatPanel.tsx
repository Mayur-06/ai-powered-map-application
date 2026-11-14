'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  Sparkles,
  X,
  RotateCcw,
  Square,
  ArrowUp,
  AlertCircle,
  RefreshCw,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMapStore } from '@/lib/store/mapStore';
import { getMapInstance } from '@/lib/mapRegistry';
import {
  applyToolResult,
  isToolCallApplied,
  markToolCallApplied,
  clearAppliedToolCalls,
} from '@/lib/ai/applyToolResult';
import PlaceCard, { type PlaceItem } from '@/components/chat/PlaceCard';
import RouteCard from '@/components/chat/RouteCard';

const EXAMPLE_PROMPTS = [
  'Find a hospital near me',
  'Take me to the nearest pharmacy',
  'Show me parks nearby',
];

function getLatestContext() {
  const userLoc = useMapStore.getState().userLocation;
  const map = getMapInstance();
  let bounds: { west: number; south: number; east: number; north: number } | null = null;

  if (map) {
    try {
      const b = map.getBounds();
      if (b) {
        bounds = {
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        };
      }
    } catch {
      // Map may not be initialized yet
    }
  }

  return {
    userLocation: userLoc
      ? { lng: userLoc.longitude, lat: userLoc.latitude }
      : null,
    bounds,
  };
}

function getFriendlyErrorMessage(err?: Error): string {
  if (!err) return '';
  const msg = err.message || '';
  if (
    msg.includes('429') ||
    msg.toLowerCase().includes('rate limit') ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('busy')
  ) {
    return 'The AI service is currently busy. Please wait a moment and try again.';
  }
  if (
    msg.toLowerCase().includes('network') ||
    msg.toLowerCase().includes('failed to fetch') ||
    msg.toLowerCase().includes('load failed')
  ) {
    return 'Unable to connect to the AI service. Please check your network connection.';
  }
  return 'Something went wrong while processing your request. Please try again.';
}

interface ParsedTool {
  toolName: string;
  toolCallId: string;
  state: string;
  output?: Record<string, unknown>;
  errorText?: string;
}

function parseToolPart(part: unknown): ParsedTool | null {
  if (!part || typeof part !== 'object') return null;
  const p = part as {
    type?: string;
    toolName?: string;
    toolCallId?: string;
    state?: string;
    output?: Record<string, unknown>;
    errorText?: string;
  };
  if (p.type === 'dynamic-tool') {
    return {
      toolName: p.toolName || '',
      toolCallId: p.toolCallId || '',
      state: p.state || '',
      output: p.output,
      errorText: p.errorText,
    };
  }
  if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
    return {
      toolName: p.type.replace(/^tool-/, ''),
      toolCallId: p.toolCallId || '',
      state: p.state || '',
      output: p.output,
      errorText: p.errorText,
    };
  }
  return null;
}

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const isNavigating = useMapStore((state) => state.isNavigating);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dedicated transport that attaches fresh map context with every request
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({
          context: getLatestContext(),
        }),
      }),
    []
  );

  const {
    messages,
    sendMessage,
    stop,
    status,
    error,
    regenerate,
    setMessages,
  } = useChat({
    transport,
  });

  const isStreaming = status === 'submitted' || status === 'streaming';

  // Apply completed tool results exactly once to the map store
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== 'assistant' || !Array.isArray(message.parts)) continue;

      for (const part of message.parts) {
        const parsed = parseToolPart(part);
        if (!parsed) continue;

        // Only apply results from completed tool calls (output available), never partial input
        if (parsed.state === 'output-available' && parsed.toolCallId) {
          if (!isToolCallApplied(parsed.toolCallId)) {
            markToolCallApplied(parsed.toolCallId);
            if (parsed.output && !parsed.output.error) {
              void applyToolResult(parsed.toolName, parsed.output);
            }
          }
        }
      }
    }
  }, [messages]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, status, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const query = (textToSend ?? input).trim();
      if (!query || isStreaming) return;

      setInput('');
      try {
        await sendMessage(
          { text: query },
          {
            body: {
              context: getLatestContext(),
            },
          }
        );
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    },
    [input, isStreaming, sendMessage]
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    clearAppliedToolCalls();
    setInput('');
  }, [setMessages]);

  return (
    <>
      {/* Floating Toggle Button - positioned to avoid Legend, NavPanel and controls */}
      <div
        className={`absolute z-30 transition-all duration-200 ${
          isNavigating
            ? 'bottom-[224px] right-4 sm:bottom-6 sm:right-48'
            : 'bottom-6 right-4 sm:right-48'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold shadow-lg backdrop-blur-md transition-all cursor-pointer ${
            isOpen
              ? 'bg-primary text-primary-foreground ring-2 ring-primary/40'
              : 'border border-border bg-background/95 text-foreground hover:bg-muted hover:scale-105'
          }`}
          aria-label={isOpen ? 'Close AI chat' : 'Open AI chat'}
          title="AI Map Assistant"
        >
          <Sparkles className="h-4 w-4 text-amber-500 fill-amber-400" />
          <span className="hidden sm:inline">Ask AI</span>
          <span className="sm:hidden">AI</span>
        </button>
      </div>

      {/* Chat Panel: Bottom sheet on mobile, side panel on desktop */}
      <div
        className={`fixed sm:absolute z-30 flex flex-col bg-background/95 backdrop-blur-md border border-border shadow-2xl transition-all duration-300 ease-in-out ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none scale-95'
        } ${
          // Mobile (<640px): bottom sheet, docked above NavPanel when navigating
          isNavigating
            ? 'bottom-[224px] left-2 right-2 max-h-[calc(100vh-290px)] rounded-2xl'
            : 'bottom-0 left-0 right-0 max-h-[65vh] rounded-t-2xl sm:rounded-2xl'
        } ${
          // Desktop (>=640px): side panel positioned to avoid Legend, SearchBar and NavPanel
          'sm:bottom-auto sm:top-36 sm:right-4 sm:left-auto sm:w-96 sm:h-[calc(100vh-420px)] sm:min-h-[380px] sm:max-h-[600px]'
        }`}
        style={!isOpen ? { display: 'none' } : undefined}
        role="dialog"
        aria-label="AI Map Assistant"
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground leading-tight">
                AI Map Assistant
              </h3>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                Greater Noida Guide
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={handleNewChat}
              title="Start a new chat"
              aria-label="Start a new chat"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => setIsOpen(false)}
              title="Close chat panel"
              aria-label="Close chat panel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-2.5">
                <MessageSquare className="h-5 w-5" />
              </div>
              <p className="font-semibold text-foreground text-xs">
                How can I help you explore?
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-[240px]">
                Ask for nearby places, directions, or ask me to move the map.
              </p>

              {/* 3 Example Prompts */}
              <div className="mt-4 flex flex-col gap-1.5 w-full">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="text-left rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted hover:border-primary/40 transition-colors cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const isUser = message.role === 'user';

              return (
                <div
                  key={message.id}
                  className={`flex flex-col gap-2 ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Message bubble for user or assistant text */}
                  {Array.isArray(message.parts) ? (
                    message.parts.map((part, idx) => {
                      if (part.type === 'text' && part.text) {
                        return (
                          <div
                            key={idx}
                            className={`rounded-2xl px-3.5 py-2 max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                              isUser
                                ? 'bg-primary text-primary-foreground font-normal'
                                : 'bg-muted/80 text-foreground font-normal border border-border/40'
                            }`}
                          >
                            {part.text}
                          </div>
                        );
                      }

                      // Check for tool results
                      const parsedTool = parseToolPart(part);
                      if (parsedTool) {
                        // Inline error note if tool execution returned an error
                        if (
                          parsedTool.output?.error ||
                          parsedTool.state === 'output-error'
                        ) {
                          const errCode = (parsedTool.output?.error || parsedTool.errorText) as string;
                          const note =
                            errCode === 'no_user_location'
                              ? 'Tap the locate button so I know where you are.'
                              : errCode === 'poi_not_found'
                              ? 'Could not find details for that place.'
                              : errCode === 'no_route_found'
                              ? 'No route could be found to that destination.'
                              : 'Could not complete this map action.';

                          return (
                            <div
                              key={idx}
                              className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-200"
                            >
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              <span>{note}</span>
                            </div>
                          );
                        }

                        // Completed searchPlaces tool: render PlaceCard list
                        if (
                          parsedTool.toolName === 'searchPlaces' &&
                          parsedTool.state === 'output-available' &&
                          parsedTool.output
                        ) {
                          const places = (Array.isArray(parsedTool.output.places)
                            ? parsedTool.output.places
                            : []) as PlaceItem[];

                          if (places.length > 0) {
                            return (
                              <div
                                key={idx}
                                className="flex flex-col gap-1.5 w-full mt-1"
                              >
                                {places.map((place) => (
                                  <PlaceCard key={place.id} place={place} />
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }

                        // Completed getRoute tool: render RouteCard
                        if (
                          parsedTool.toolName === 'getRoute' &&
                          parsedTool.state === 'output-available' &&
                          parsedTool.output?.destination
                        ) {
                          const destination = parsedTool.output.destination as {
                            id?: string;
                            name: string;
                            lng?: number;
                            lat?: number;
                          };
                          const distanceM =
                            typeof parsedTool.output.distanceM === 'number'
                              ? parsedTool.output.distanceM
                              : undefined;
                          const durationS =
                            typeof parsedTool.output.durationS === 'number'
                              ? parsedTool.output.durationS
                              : undefined;
                          const mode =
                            typeof parsedTool.output.mode === 'string'
                              ? parsedTool.output.mode
                              : undefined;

                          return (
                            <div key={idx} className="w-full mt-1">
                              <RouteCard
                                destination={destination}
                                distanceM={distanceM}
                                durationS={durationS}
                                mode={mode}
                              />
                            </div>
                          );
                        }
                      }

                      return null;
                    })
                  ) : null}
                </div>
              );
            })
          )}

          {/* Typing Indicator while streaming */}
          {isStreaming && (
            <div className="flex items-center gap-1.5 text-muted-foreground py-1 px-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
            </div>
          )}

          {/* Friendly Error Banner with Retry */}
          {error && (
            <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-xs font-medium leading-snug">
                  {getFriendlyErrorMessage(error)}
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => regenerate()}
                  className="h-7 gap-1 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/20 cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Retry</span>
                </Button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Panel Footer: Input form */}
        <div className="border-t border-border/60 p-3 bg-background/80 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                type="text"
                value={input}
                maxLength={500}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about places or directions..."
                className="h-9 pr-7 text-xs bg-muted/40"
                disabled={isStreaming}
              />
              {input.length > 400 && (
                <span className="absolute right-2 top-2 text-[10px] text-muted-foreground font-mono">
                  {500 - input.length}
                </span>
              )}
            </div>

            {isStreaming ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => stop()}
                className="h-9 px-3 gap-1 cursor-pointer"
                title="Stop generation"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span className="text-xs">Stop</span>
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={!input.trim()}
                className="h-9 px-3 cursor-pointer"
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
