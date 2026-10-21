// The surface module of a pointer target: an `[Image #N]` chip that says when the pointer comes onto
// it, so the hooks module opens that image's window; when it leaves, so it closes; and when it is
// clicked, so it opens the image.
import type { ClientModule } from 'claude-code'

type Props = { label?: string } | null

const Chip: ClientModule<Props, { isOver: boolean; isPressed?: boolean }> = (props, surface) => {
  surface.onPointer(event => {
    // A click is the left button let go over the chip it went down on.
    if (event.type === 'down') {
      if (event.button === 'left') {
        surface.setState({ isOver: true, isPressed: true })
      }

      return
    }

    if (event.type === 'up') {
      // A region not laid out yet (0 by 0) says nothing of where the pointer is.
      const isInside =
        surface.columns === 0 || (event.x >= 0 && event.y >= 0 && event.x < surface.columns && event.y < surface.rows)

      if (surface.state?.isPressed === true && isInside) {
        surface.post({ isOver: true, isClicked: true })
      }

      surface.setState({ isOver: isInside })
      return
    }

    if (event.type === 'enter' || event.type === 'leave') {
      const isOver = event.type === 'enter'
      surface.post({ isOver })
      surface.setState({ isOver })
    }
  })

  const { Box, Text } = surface.elements

  return props?.label === undefined ? <Box /> : <Text color="claude" inverse={surface.state?.isOver === true}>{props.label}</Text>
}

export default Chip
