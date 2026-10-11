import axios from "axios";

const TELEGRAM_API_URL =
  "https://api.telegram.org";

type TelegramResponse = {
  ok: boolean;
  description?: string;
};

export async function sendTelegramMessage(
  message: string,
): Promise<boolean> {
  const token =
    process.env.TELEGRAM_BOT_TOKEN;

  const chatId =
    process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error(
      "Telegram configuration is missing.",
    );

    return false;
  }

  try {
    const response =
      await axios.post<TelegramResponse>(
        `${TELEGRAM_API_URL}/bot${token}/sendMessage`,
        {
          chat_id: chatId,
          text: message,
          disable_web_page_preview: true,
        },
      );

    if (!response.data.ok) {
      console.error(
        "Telegram API error:",
        response.data.description,
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Telegram notification error:",
      error,
    );

    return false;
  }
}
