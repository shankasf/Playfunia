import useSWR from 'swr';
import { sampleSocialPosts } from '../../data/sampleData';
import styles from './InstagramFeed.module.css';

interface InstagramPost {
    id: string;
    mediaUrl: string;
    permalink: string;
    caption?: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
    timestamp: string;
}

export function InstagramFeed() {
    const { data, isLoading, error } = useSWR<{ posts: InstagramPost[] }>(
        '/content/instagram',
        {
            fallbackData: { posts: [] },
            // Instagram feed doesn't need frequent updates
            revalidateOnFocus: false,
            dedupingInterval: 60000, // 1 minute
        }
    );

    const posts = data?.posts?.slice(0, 6) ?? [];
    // Show sample posts as fallback if no live feed
    const displayPosts = posts.length > 0 ? posts : (error ? sampleSocialPosts : []);

    return (
        <section className={styles.section} aria-labelledby="instagram-heading">
            <div className={styles.header}>
                <span className={styles.tag}>Live from Instagram</span>
                <h2 id="instagram-heading">See the smiles happening right now</h2>
                <p>
                    Catch the latest parties, play sessions, and toddler giggles in real time.
                    Follow us <a href="https://instagram.com/playfunia_" target="_blank" rel="noreferrer">@playfunia_</a>
                </p>
            </div>

            <div className={styles.grid}>
                {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={styles.skeleton} aria-hidden="true" />
                    ))
                ) : (
                    displayPosts.map((post) => (
                        <a
                            key={post.id}
                            className={styles.card}
                            href={'permalink' in post ? post.permalink : (post as unknown as { link: string }).link}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <div
                                className={styles.image}
                                style={{
                                    backgroundImage: `url(${'mediaUrl' in post ? post.mediaUrl : (post as unknown as { imageUrl: string }).imageUrl})`,
                                }}
                                aria-hidden="true"
                            />
                            {'mediaType' in post && post.mediaType === 'VIDEO' && (
                                <span className={styles.videoIcon}>&#9658;</span>
                            )}
                            <p className={styles.caption}>
                                {(post.caption ?? (post as unknown as { caption?: string }).caption ?? '').slice(0, 80)}
                                {(post.caption?.length ?? 0) > 80 ? '...' : ''}
                            </p>
                        </a>
                    ))
                )}
            </div>

            <div className={styles.followCta}>
                <a
                    href="https://instagram.com/playfunia_"
                    target="_blank"
                    rel="noreferrer"
                    className={styles.followButton}
                >
                    Follow @playfunia_ on Instagram
                </a>
            </div>
        </section>
    );
}
