const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

app.use(cors());
app.use(express.json());

// Endpoint for fetching and extracting text from URL
app.post('/api/fetch-url', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    let validUrl;
    try {
      validUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Fetch the webpage
    const response = await axios.get(validUrl.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    // Parse HTML
    const $ = cheerio.load(response.data);

    // Remove unwanted elements
    $('script, style, nav, header, footer, iframe, noscript').remove();

    // Get text
    let text = '';
    const mainContent = $('main, article, .content, .post, .article, #content').first();
    if (mainContent.length) {
      text = mainContent.text();
    } else {
      text = $('body').text();
    }

    // Clean up
    text = text.replace(/\s+/g, ' ').replace(/\n+/g, ' ').trim();

    if (!text || text.length < 10) {
      return res.status(400).json({ error: 'Could not extract meaningful text from URL' });
    }

    res.json({ text, url: validUrl.href });

  } catch (error) {
    console.error('Error fetching URL:', error.message);

    if (error.code === 'ENOTFOUND') {
      return res.status(404).json({ error: 'Сайт не найден. Проверьте правильность URL.' });
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'Превышено время ожидания. Сайт слишком долго не отвечает.' });
    }

    if (error.response) {
      const status = error.response.status;
      if (status === 403) {
        return res.status(403).json({ error: 'Доступ запрещён. Сайт блокирует автоматические запросы.' });
      }
      if (status === 404) {
        return res.status(404).json({ error: 'Страница не найдена (404). Проверьте правильность ссылки.' });
      }
      if (status >= 500) {
        return res.status(502).json({ error: 'Ошибка на сервере сайта. Попробуйте позже.' });
      }
    }

    res.status(500).json({ error: 'Не удалось загрузить содержимое URL. Попробуйте другую ссылку.' });
  }
});

// Export for Vercel
module.exports = app;
