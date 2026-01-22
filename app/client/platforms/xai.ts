"use client";
// XAI API implementation with image generation support
import { ApiPath, XAI_BASE_URL, XAI } from "@/app/constant";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  ChatMessageTool,
  usePluginStore,
} from "@/app/store";
import { stream } from "@/app/utils/chat";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  SpeechOptions,
} from "../api";
import { getClientConfig } from "@/app/config/client";
import { getTimeoutMSByModel, getMessageTextContent } from "@/app/utils";
import {
  preProcessImageContent,
  uploadImage,
  base64Image2Blob,
} from "@/app/utils/chat";
import { RequestPayload } from "./openai";
import { fetch } from "@/app/utils/stream";

interface XAIImageRequestPayload {
  model: string;
  prompt: string;
  n?: number;
  response_format?: "url" | "b64_json";
}

export class XAIApi implements LLMApi {
  private disableListModels = true;

  private isImageModel(model: string): boolean {
    return model.toLowerCase().includes("image");
  }

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.xaiUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = ApiPath.XAI;
      baseUrl = isApp ? XAI_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.XAI)) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    return [baseUrl, path].join("/");
  }

  extractMessage(res: any) {
    // Handle image generation response
    if (res.data) {
      let url = res.data?.at(0)?.url ?? "";
      const b64_json = res.data?.at(0)?.b64_json ?? "";
      if (!url && b64_json) {
        // Convert base64 to blob and upload
        return uploadImage(base64Image2Blob(b64_json, "image/jpeg")).then(
          (uploadedUrl) => {
            return [
              {
                type: "image_url",
                image_url: {
                  url: uploadedUrl,
                },
              },
            ];
          },
        );
      }
      if (url) {
        return [
          {
            type: "image_url",
            image_url: {
              url,
            },
          },
        ];
      }
    }

    // Handle chat response
    return res.choices?.at(0)?.message?.content ?? "";
  }

  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async chat(options: ChatOptions) {
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    const isImageGeneration = this.isImageModel(modelConfig.model);

    if (isImageGeneration) {
      // Handle image generation
      const lastMessage = options.messages[options.messages.length - 1];
      const prompt = getMessageTextContent(lastMessage);

      const requestPayload: XAIImageRequestPayload = {
        model: modelConfig.model,
        prompt,
        n: 1,
        response_format: "b64_json", // Use base64 for better handling
      };

      console.log("[Request] xai image payload: ", requestPayload);

      const controller = new AbortController();
      options.onController?.(controller);

      try {
        const imagePath = this.path(XAI.ImagePath);
        const imagePayload = {
          method: "POST",
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
          headers: getHeaders(),
        };

        const requestTimeoutId = setTimeout(
          () => controller.abort(),
          getTimeoutMSByModel(options.config.model),
        );

        const res = await fetch(imagePath, imagePayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        console.log("[Response] xai image:", resJson);

        if (resJson.error) {
          options.onError?.(
            new Error(resJson.error.message || "Image generation failed"),
          );
          return;
        }

        // Handle base64 image response
        const b64_json = resJson.data?.at(0)?.b64_json;
        if (b64_json) {
          try {
            const uploadedUrl = await uploadImage(
              base64Image2Blob(b64_json, "image/jpeg"),
            );
            const message = [
              {
                type: "image_url",
                image_url: {
                  url: uploadedUrl,
                },
              },
            ];
            options.onFinish(message as any, res);
          } catch (uploadError) {
            console.error("Failed to upload image:", uploadError);
            options.onError?.(new Error("Failed to process generated image"));
          }
        } else {
          options.onError?.(new Error("No image data received"));
        }

        return;
      } catch (e) {
        console.log("[Request] failed to make image generation request", e);
        options.onError?.(e as Error);
        return;
      }
    }

    // Handle regular chat
    const messages: ChatOptions["messages"] = [];
    for (const v of options.messages) {
      const content = await preProcessImageContent(v.content);
      messages.push({ role: v.role, content });
    }

    const requestPayload: RequestPayload = {
      messages,
      stream: options.config.stream,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      presence_penalty: modelConfig.presence_penalty,
      frequency_penalty: modelConfig.frequency_penalty,
      top_p: modelConfig.top_p,
    };

    console.log("[Request] xai payload: ", requestPayload);

    const shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const chatPath = this.path(XAI.ChatPath);
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        getTimeoutMSByModel(options.config.model),
      );

      if (shouldStream) {
        const [tools, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );
        return stream(
          chatPath,
          requestPayload,
          getHeaders(),
          tools as any,
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const json = JSON.parse(text);
            const choices = json.choices as Array<{
              delta: {
                content: string;
                tool_calls: ChatMessageTool[];
              };
            }>;
            const tool_calls = choices[0]?.delta?.tool_calls;
            if (tool_calls?.length > 0) {
              const index = tool_calls[0]?.index;
              const id = tool_calls[0]?.id;
              const args = tool_calls[0]?.function?.arguments;
              if (id) {
                runTools.push({
                  id,
                  type: tool_calls[0]?.type,
                  function: {
                    name: tool_calls[0]?.function?.name as string,
                    arguments: args,
                  },
                });
              } else {
                // @ts-ignore
                runTools[index]["function"]["arguments"] += args;
              }
            }
            return choices[0]?.delta?.content;
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // @ts-ignore
            requestPayload?.messages?.splice(
              // @ts-ignore
              requestPayload?.messages?.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          options,
        );
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = this.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  async usage() {
    return {
      used: 0,
      total: 0,
    };
  }

  async models(): Promise<LLMModel[]> {
    return [];
  }
}
