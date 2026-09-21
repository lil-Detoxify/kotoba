<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";

onLaunch(() => {
  console.log("KotoBud Mini Program launched");
});

onShow(() => {
  console.log("KotoBud Mini Program shown");
});

onHide(() => {
  console.log("KotoBud Mini Program hidden");
});
</script>

<style>
page {
  background-color: #F9F8F6;
  color: #1F2937;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 28rpx;
  line-height: 1.5;
}

view, text, button, input {
  box-sizing: border-box;
}

.container {
  padding: 32rpx;
}

.card {
  background: #FFFFFF;
  border-radius: 20rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
  border: 1rpx solid #F0ECE4;
}

.primary-btn {
  background: #D9532F;
  color: #FFFFFF;
  border-radius: 40rpx;
  font-weight: 600;
  font-size: 30rpx;
  padding: 20rpx 48rpx;
  text-align: center;
  border: none;
}

.secondary-btn {
  background: #EFECE6;
  color: #4B5563;
  border-radius: 40rpx;
  font-weight: 500;
  font-size: 28rpx;
  padding: 16rpx 40rpx;
  text-align: center;
  border: none;
}
</style>
