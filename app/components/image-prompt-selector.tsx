import React, { useState } from "react";
import { Modal, List, ListItem } from "./ui-lib";
import { IconButton } from "./button";
import {
  IMAGE_PROMPT_TEMPLATES,
  IMAGE_CATEGORIES,
  IMAGE_GENERATION_MODELS,
  ImagePromptTemplate,
} from "../utils/image-prompts";
import { useChatStore } from "../store";
import { ServiceProvider } from "../constant";
import CloseIcon from "../icons/close.svg";
import ConfirmIcon from "../icons/confirm.svg";
import RobotIcon from "../icons/robot.svg";
import styles from "./ui-lib.module.scss";

interface ImagePromptSelectorProps {
  onClose: () => void;
  onSelect: (prompt: string) => void;
}

export function ImagePromptSelector({
  onClose,
  onSelect,
}: ImagePromptSelectorProps) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>(
    session.mask.modelConfig.model || "dall-e-3",
  );

  const filteredTemplates =
    selectedCategory === "all"
      ? IMAGE_PROMPT_TEMPLATES
      : IMAGE_PROMPT_TEMPLATES.filter(
          (template) => template.category === selectedCategory,
        );

  const handleTemplateSelect = (template: ImagePromptTemplate) => {
    const prompt = template.prompt.replace(/\[.*?\]/g, ""); // 移除占位符
    onSelect(prompt);
    onClose();
  };

  const handleCustomPromptSubmit = () => {
    if (customPrompt.trim()) {
      onSelect(customPrompt.trim());
      onClose();
    }
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    const model = IMAGE_GENERATION_MODELS.find((m) => m.id === modelId);
    if (model) {
      // 更新会话中的模型配置
      chatStore.updateTargetSession(session, (session) => {
        session.mask.modelConfig.model = model.id;
        session.mask.modelConfig.providerName =
          model.provider as ServiceProvider;
      });
    }
  };

  return (
    <div className="modal-mask">
      <Modal
        title="🎨 图片生成助手"
        onClose={onClose}
        actions={[
          <IconButton
            key="close"
            icon={<CloseIcon />}
            text="关闭"
            onClick={onClose}
          />,
        ]}
      >
        <div style={{ maxHeight: "60vh", overflow: "auto" }}>
          {/* 模型选择 */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ marginBottom: "10px", fontWeight: "bold" }}>
              选择图片生成模型：
            </div>
            <List>
              {IMAGE_GENERATION_MODELS.map((model) => (
                <ListItem
                  key={model.id}
                  title={`${model.name} ${
                    selectedModel === model.id ? "✓" : ""
                  }`}
                  subTitle={
                    <div>
                      <div>{model.description}</div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-color-secondary)",
                          marginTop: "4px",
                        }}
                      >
                        特性: {model.features.join(", ")}
                      </div>
                    </div>
                  }
                  onClick={() => handleModelChange(model.id)}
                  className="clickable"
                />
              ))}
            </List>
          </div>

          {/* 分类选择 */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ marginBottom: "10px", fontWeight: "bold" }}>
              选择风格分类：
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button
                className={
                  selectedCategory === "all"
                    ? styles["category-button-active"]
                    : styles["category-button"]
                }
                onClick={() => setSelectedCategory("all")}
              >
                🎯 全部
              </button>
              {IMAGE_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  className={
                    selectedCategory === category.id
                      ? styles["category-button-active"]
                      : styles["category-button"]
                  }
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.icon} {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* 模板列表 */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ marginBottom: "10px", fontWeight: "bold" }}>
              选择模板：
            </div>
            <List>
              {filteredTemplates.map((template) => (
                <ListItem
                  key={template.id}
                  title={template.title}
                  subTitle={template.prompt}
                  onClick={() => handleTemplateSelect(template)}
                  className="clickable"
                />
              ))}
            </List>
          </div>

          {/* 自定义提示词 */}
          <div>
            <div style={{ marginBottom: "10px", fontWeight: "bold" }}>
              或输入自定义提示词：
            </div>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="描述您想要生成的图片..."
              style={{
                width: "100%",
                minHeight: "80px",
                padding: "10px",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                resize: "vertical",
              }}
            />
            <div style={{ marginTop: "10px", textAlign: "right" }}>
              <IconButton
                icon={<ConfirmIcon />}
                text="使用此提示词"
                onClick={handleCustomPromptSubmit}
                disabled={!customPrompt.trim()}
                type="primary"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
