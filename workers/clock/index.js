// Cloudflare Worker "serene-clock": mỗi phút gọi trang web để gửi bài tới giờ sang Make.
// Cần 2 biến trong Cloudflare: TICK_URL (địa chỉ /api/machine/tick) và TICK_KEY (khóa riêng, nhập dạng Secret).
export default {
  async scheduled(event, env, ctx) {
    const res = await fetch(env.TICK_URL, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.TICK_KEY },
    });
    if (!res.ok) console.error('Gọi tick lỗi, mã ' + res.status);
  },
};
