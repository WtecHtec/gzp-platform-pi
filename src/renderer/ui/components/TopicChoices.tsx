import type { TopicOption } from '../../../shared/contracts';

export default function TopicChoices({
  options,
  onSelect,
}: {
  options: TopicOption[];
  onSelect: (topic: TopicOption) => void;
}) {
  return (
    <div className="topic-list">
      {options.map((topic, index) => (
        <button
          className="topic-option"
          key={topic.id}
          onClick={() => onSelect(topic)}
          type="button"
        >
          <span className="topic-number">0{index + 1}</span>
          <span>
            <strong>{topic.title}</strong>
            <small>{topic.angle}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
