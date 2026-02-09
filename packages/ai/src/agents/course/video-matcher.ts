// ============================================================
// VIDEO MATCHER — packages/ai/src/agents/course/video-matcher.ts
// YouTube Data API v3 integration for lesson video matching
// ============================================================

import type { CourseModule, YouTubeVideo, LessonVideoMatch } from '@inkdown/shared/types'

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search'

async function searchYouTube(
  query: string,
  apiKey: string,
  maxResults: number = 3
): Promise<YouTubeVideo[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(maxResults),
    videoEmbeddable: 'true',
    key: apiKey,
  })

  const response = await fetch(`${YOUTUBE_SEARCH_URL}?${params}`)
  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`YouTube API error (${response.status}): ${errorBody}`)
  }

  const data = (await response.json()) as {
    items: {
      id: { videoId: string }
      snippet: {
        title: string
        channelTitle: string
        thumbnails: { medium: { url: string } }
        description: string
      }
    }[]
  }

  return (data.items ?? []).map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnailUrl: item.snippet.thumbnails.medium.url,
    description: item.snippet.description,
  }))
}

export async function matchVideosForLessons(
  modules: CourseModule[],
  youtubeApiKey: string
): Promise<LessonVideoMatch[]> {
  const matches: LessonVideoMatch[] = []

  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      // Only match video-type and lecture-type lessons
      if (lesson.type !== 'video' && lesson.type !== 'lecture') continue

      const query = `"${lesson.title}" tutorial`
      const videos = await searchYouTube(query, youtubeApiKey, 3)

      matches.push({
        lessonId: lesson.id,
        videos,
        selectedVideoId: videos.length > 0 ? videos[0].videoId : null,
      })
    }
  }

  return matches
}
